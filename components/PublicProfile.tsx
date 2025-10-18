import React, { useState, useEffect } from 'react';
import { User, Member, Post } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { PostItem } from './PostsFeed'; // Re-using PostItem from PostsFeed

interface PublicProfileProps {
  userId: string;
  currentUserId: string;
  onBack: () => void;
  onStartChat: (targetUserId: string) => void;
  onViewProfile: (userId: string) => void; // For viewing profiles from posts
}

const DetailItem: React.FC<{label: string, value: string | undefined}> = ({label, value}) => (
    <div>
        <dt className="text-sm font-medium text-gray-400">{label}</dt>
        <dd className="mt-1 text-white">{value || <span className="text-gray-500 italic">Not specified</span>}</dd>
    </div>
);

const Pill: React.FC<{text: string}> = ({ text }) => (
    <span className="inline-block bg-slate-700 rounded-full px-3 py-1 text-sm font-semibold text-gray-300 mr-2 mb-2">
        {text}
    </span>
);

export const PublicProfile: React.FC<PublicProfileProps> = ({ userId, currentUserId, onBack, onStartChat, onViewProfile }) => {
    const [user, setUser] = useState<User | null>(null);
    const [memberDetails, setMemberDetails] = useState<Member | null>(null);
    const [posts, setPosts] = useState<Post[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { addToast } = useToast();

    useEffect(() => {
        const fetchProfileData = async () => {
            setIsLoading(true);
            try {
                const [userData, postsData] = await Promise.all([
                    api.getUserProfile(userId),
                    api.getPostsByAuthor(userId)
                ]);

                if (userData) {
                    setUser(userData);
                    if (userData.role === 'member') {
                        const memberData = await api.getMemberByUid(userId);
                        setMemberDetails(memberData);
                    }
                } else {
                    addToast("Could not find user profile.", "error");
                }
                
                setPosts(postsData);
            } catch (error) {
                addToast("Failed to load profile data.", "error");
                console.error("Profile load error:", error);
            } finally {
                setIsLoading(false);
            }
        };

        if (userId) {
          fetchProfileData();
        } else {
          addToast("User ID is missing.", "error");
          setIsLoading(false);
          setUser(null);
        }
    }, [userId, addToast]);

    const handleUpvote = async (postId: string) => {
        try {
            await api.upvotePost(postId, currentUserId);
        } catch (error) {
            addToast("Could not process upvote.", "error");
        }
    };
    
    // Deleting/editing posts from a public profile view is complex, so we'll disable it for now.
    const handlePlaceholder = () => {
        addToast("This action can only be performed from your own feed.", "info");
    };

    if (isLoading) {
        return <div className="text-center p-10">Loading profile...</div>;
    }

    if (!user) {
        return (
            <div>
                 <button onClick={onBack} className="inline-flex items-center mb-6 text-sm font-medium text-green-400 hover:text-green-300">
                    <ArrowLeftIcon className="h-4 w-4 mr-2" /> Back
                </button>
                <div className="text-center p-10">User not found.</div>
            </div>
        );
    }
    
    const skillsArray = memberDetails?.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interestsArray = memberDetails?.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const passionsArray = memberDetails?.passions?.split(',').map(s => s.trim()).filter(Boolean) || [];

    return (
        <div className="animate-fade-in">
            <button onClick={onBack} className="inline-flex items-center mb-6 text-sm font-medium text-green-400 hover:text-green-300">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back
            </button>
            
            <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div>
                        <h2 className="text-3xl font-bold text-white">{user.name}</h2>
                        <p className="text-lg text-green-400">{memberDetails?.profession || <span className="capitalize">{user.role}</span>}</p>
                        <p className="text-sm text-gray-400">{user.circle}</p>
                    </div>
                    {user.id !== currentUserId && (
                         <button 
                            onClick={() => onStartChat(user.id)}
                            className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-md hover:bg-green-700 w-full sm:w-auto"
                        >
                            <MessageSquareIcon className="h-4 w-4" />
                            <span>Send Message</span>
                        </button>
                    )}
                </div>
                
                <div className="mt-6 pt-4 border-t border-slate-700 space-y-6">
                    {/* ABOUT SECTION */}
                    <div>
                        <h3 className="text-md font-semibold text-gray-300 mb-2">About</h3>
                        <p className="text-gray-300 whitespace-pre-wrap">{user.bio || memberDetails?.bio || 'No bio provided.'}</p>
                        <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                            <DetailItem label="Gender" value={memberDetails?.gender} />
                            <DetailItem label="Age" value={memberDetails?.age} />
                        </dl>
                    </div>
                    
                    {/* CONTACT SECTION */}
                    <div>
                        <h3 className="text-md font-semibold text-gray-300 mb-2">Contact Information</h3>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                            <DetailItem label="Email" value={user.email} />
                            <DetailItem label="Phone Number" value={user.phone} />
                        </dl>
                    </div>

                    {/* MEMBER-SPECIFIC DETAILS */}
                    {user.role === 'member' && (
                        <>
                            {skillsArray.length > 0 && (
                                <div>
                                    <h3 className="text-md font-semibold text-gray-300 mb-2">Skills</h3>
                                    <div>{skillsArray.map(skill => <Pill key={skill} text={skill} />)}</div>
                                </div>
                            )}
                            {interestsArray.length > 0 && (
                                <div>
                                    <h3 className="text-md font-semibold text-gray-300 mb-2">Interests</h3>
                                    <div>{interestsArray.map(item => <Pill key={item} text={item} />)}</div>
                                </div>
                            )}
                            {passionsArray.length > 0 && (
                                <div>
                                    <h3 className="text-md font-semibold text-gray-300 mb-2">Passions</h3>
                                    <div>{passionsArray.map(item => <Pill key={item} text={item} />)}</div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <div className="mt-8">
                <h3 className="text-xl font-semibold text-white mb-4">Posts by {user.name}</h3>
                {posts.length > 0 ? (
                    <div className="space-y-4">
                        {posts.map(post => (
                           <PostItem 
                                key={post.id} 
                                post={post} 
                                currentUser={{id: currentUserId} as User} 
                                onUpvote={handleUpvote}
                                onDelete={handlePlaceholder}
                                onEdit={handlePlaceholder}
                                onReport={handlePlaceholder}
                                onViewProfile={onViewProfile}
                                onRepost={handlePlaceholder}
                                onShare={handlePlaceholder}
                           />
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-8 bg-slate-800 rounded-lg">
                        <p className="text-gray-400">{user.name} hasn't made any posts yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
};