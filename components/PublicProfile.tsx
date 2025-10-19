import React, { useState, useEffect } from 'react';
import { User, Member, Post, MemberUser } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { ArrowLeftIcon } from './icons/ArrowLeftIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { PostsFeed } from './PostsFeed';
import { IdCardIcon } from './icons/IdCardIcon';
import { InfoIcon } from './icons/InfoIcon';
import { MemberCard } from './MemberCard';
import { UserPlusIcon } from './icons/UserPlusIcon';
import { UserCheckIcon } from './icons/UserCheckIcon';
import { FlagIcon } from './icons/FlagIcon';
import { MoreVerticalIcon } from './icons/MoreVerticalIcon';
import { ReportUserModal } from './ReportUserModal';


interface PublicProfileProps {
  userId: string;
  currentUser: User;
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

export const PublicProfile: React.FC<PublicProfileProps> = ({ userId, currentUser, onBack, onStartChat, onViewProfile }) => {
    const [user, setUser] = useState<User | null>(null);
    const [memberDetails, setMemberDetails] = useState<Member | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showCard, setShowCard] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isProcessingFollow, setIsProcessingFollow] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const { addToast } = useToast();

    useEffect(() => {
        setIsFollowing(currentUser.following?.includes(userId) ?? false);
    }, [currentUser, userId]);

    useEffect(() => {
        const fetchProfileData = async () => {
            setIsLoading(true);
            setShowCard(false); // Reset card view on profile change
            try {
                const userData = await api.getUserProfile(userId);

                if (userData) {
                    setUser(userData);
                    if (userData.role === 'member') {
                        const memberData = await api.getMemberByUid(userId);
                        setMemberDetails(memberData);
                    } else {
                        setMemberDetails(null);
                    }
                } else {
                    addToast("Could not find user profile.", "error");
                }
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
    
    const handleFollowToggle = async () => {
        if (!user) return;
        setIsProcessingFollow(true);
        try {
            if (isFollowing) {
                await api.unfollowUser(currentUser.id, user.id);
                addToast(`Unfollowed ${user.name}`, 'info');
            } else {
                await api.followUser(currentUser.id, user.id);
                addToast(`You are now following ${user.name}`, 'success');
            }
            // Local state updates for immediate feedback, context will catch up.
            setIsFollowing(!isFollowing); 
        } catch (error) {
            addToast('Action failed. Please try again.', 'error');
        } finally {
            setIsProcessingFollow(false);
        }
    };

    const handleReportSubmit = async (reason: string, details: string) => {
        if (!user) return;
        try {
            await api.reportUser(currentUser, user, reason, details);
            addToast("Report submitted successfully. An admin will review it.", "success");
        } catch (error) {
            addToast("Failed to submit report.", "error");
        }
    };

    if (isLoading) {
        return <div className="text-center p-10 text-gray-300">Loading profile...</div>;
    }

    if (!user) {
        return (
            <div>
                 <button onClick={onBack} className="inline-flex items-center mb-6 text-sm font-medium text-green-400 hover:text-green-300">
                    <ArrowLeftIcon className="h-4 w-4 mr-2" /> Back
                </button>
                <div className="text-center p-10 text-gray-300">User not found.</div>
            </div>
        );
    }
    
    const skillsArray = memberDetails?.skills?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const interestsArray = memberDetails?.interests?.split(',').map(s => s.trim()).filter(Boolean) || [];
    const passionsArray = memberDetails?.passions?.split(',').map(s => s.trim()).filter(Boolean) || [];

    const isOwnProfile = user.id === currentUser.id;

    return (
        <div className="animate-fade-in">
             {isReportModalOpen && user && (
                <ReportUserModal
                    isOpen={isReportModalOpen}
                    onClose={() => setIsReportModalOpen(false)}
                    reportedUser={user}
                    onReportSubmit={handleReportSubmit}
                />
            )}
            <button onClick={onBack} className="inline-flex items-center mb-6 text-sm font-medium text-green-400 hover:text-green-300">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                Back
            </button>
            
            <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h2 className="text-3xl font-bold text-white">{user.name}</h2>
                            <div className="relative group flex items-center gap-1">
                                <span className="font-mono text-sm py-0.5 px-2 rounded-full bg-slate-700 text-green-400">
                                    CR: {user.credibility_score ?? 100}
                                </span>
                                <InfoIcon className="h-4 w-4 text-gray-400" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 bg-slate-900 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg border border-slate-700 z-10">
                                    The Credibility Score reflects a member's standing in the community. It starts at 100 and can be affected by community reports.
                                </div>
                            </div>
                        </div>
                        <p className="text-lg text-green-400">{memberDetails?.profession || <span className="capitalize">{user.role}</span>}</p>
                        <p className="text-sm text-gray-400">{user.circle}</p>
                        <div className="flex items-center space-x-4 mt-2 text-sm text-gray-300">
                            <span><strong className="text-white">{user.followers?.length ?? 0}</strong> Followers</span>
                            <span><strong className="text-white">{user.following?.length ?? 0}</strong> Following</span>
                        </div>
                    </div>
                     <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-start">
                        {!isOwnProfile && (
                             <button 
                                onClick={() => onStartChat(user.id)}
                                className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-slate-700 text-white text-sm font-semibold rounded-md hover:bg-slate-600 w-full sm:w-auto"
                            >
                                <MessageSquareIcon className="h-4 w-4" />
                                <span>Message</span>
                            </button>
                        )}
                        {!isOwnProfile && (
                            <button 
                                onClick={handleFollowToggle}
                                disabled={isProcessingFollow}
                                className={`inline-flex items-center justify-center space-x-2 px-4 py-2 text-sm font-semibold rounded-md w-full sm:w-auto transition-colors ${isFollowing ? 'bg-green-800 text-green-300 hover:bg-green-900' : 'bg-green-600 text-white hover:bg-green-700'}`}
                            >
                                {isFollowing ? <UserCheckIcon className="h-4 w-4"/> : <UserPlusIcon className="h-4 w-4" />}
                                <span>{isFollowing ? 'Following' : 'Follow'}</span>
                            </button>
                        )}
                        {user.role === 'member' && memberDetails && (
                            <button
                                onClick={() => setShowCard(prev => !prev)}
                                className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-slate-700 text-white text-sm font-semibold rounded-md hover:bg-slate-600 w-full sm:w-auto"
                            >
                                <IdCardIcon className="h-4 w-4" />
                                <span>{showCard ? 'View Profile' : 'View Card'}</span>
                            </button>
                        )}
                         {!isOwnProfile && (
                            <div className="relative">
                                <button onClick={() => setIsMenuOpen(prev => !prev)} className="p-2 bg-slate-700 text-white rounded-md hover:bg-slate-600">
                                    <MoreVerticalIcon className="h-5 w-5"/>
                                </button>
                                {isMenuOpen && (
                                    <div className="absolute right-0 mt-2 w-48 bg-slate-900 border border-slate-700 rounded-md shadow-lg z-20">
                                        <button 
                                            onClick={() => {setIsReportModalOpen(true); setIsMenuOpen(false);}}
                                            className="w-full text-left flex items-center space-x-3 px-4 py-2 text-sm text-red-400 hover:bg-slate-800"
                                        >
                                            <FlagIcon className="h-4 w-4"/>
                                            <span>Report User</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                         )}
                    </div>
                </div>
                
                {showCard && memberDetails ? (
                     <div className="mt-6">
                        <MemberCard user={user} memberDetails={memberDetails} />
                    </div>
                ) : (
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
                    
                    {/* CONTACT SECTION (only show to admins or self) */}
                    {(currentUser.role === 'admin' || isOwnProfile) && (
                        <div>
                            <h3 className="text-md font-semibold text-gray-300 mb-2">Contact Information</h3>
                            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                                <DetailItem label="Email" value={user.email} />
                                <DetailItem label="Phone Number" value={user.phone} />
                            </dl>
                        </div>
                    )}


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
                )}
            </div>

            {!showCard && (
            <div className="mt-8">
                <h3 className="text-xl font-semibold text-white mb-4">Posts by {user.name}</h3>
                <PostsFeed 
                    user={currentUser}
                    authorId={user.id}
                    onViewProfile={onViewProfile}
                />
            </div>
            )}
        </div>
    );
};
