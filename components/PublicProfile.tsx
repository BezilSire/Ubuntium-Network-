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
import { FlagIcon } from './icons/FlagIcon';
import { ReportUserModal } from './ReportUserModal';
import { PostTypeFilter } from './PostTypeFilter';


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
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'activity' | 'about' | 'card'>('activity');
    const [typeFilter, setTypeFilter] = useState<Post['types'] | 'all'>('all');
    const { addToast } = useToast();

    useEffect(() => {
        // Reset state when the userId prop changes to prevent showing stale data.
        setUser(null);
        setMemberDetails(null);
        setIsLoading(true);
        setActiveTab('activity');
        setTypeFilter('all');

        const fetchProfileData = async () => {
            try {
                const userData = await api.getUserProfile(userId);
                if (userData) {
                    setUser(userData);
                    if (userData.role === 'member') {
                        const memberData = await api.getMemberByUid(userId);
                        setMemberDetails(memberData);
                    }
                } else {
                    addToast("Could not find user profile.", "error");
                    setUser(null);
                }
            } catch (error) {
                addToast("Failed to load profile data.", "error");
                console.error("Profile load error:", error);
                setUser(null);
            } finally {
                setIsLoading(false);
            }
        };

        if (userId) {
            fetchProfileData();
        } else {
            addToast("User ID is missing.", "error");
            setIsLoading(false);
        }
    }, [userId, addToast]);
    
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

    const renderAboutTab = () => (
        <div className="bg-slate-800 p-6 rounded-lg shadow-lg animate-fade-in space-y-6">
            <div>
                <h3 className="text-md font-semibold text-gray-300 mb-2">About</h3>
                <p className="text-gray-300 whitespace-pre-wrap">{user.bio || memberDetails?.bio || 'No bio provided.'}</p>
                <dl className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                    <DetailItem label="Gender" value={memberDetails?.gender} />
                    <DetailItem label="Age" value={memberDetails?.age} />
                </dl>
            </div>
            
            {(currentUser.role === 'admin' || isOwnProfile) && (
                <div>
                    <h3 className="text-md font-semibold text-gray-300 mb-2">Contact Information</h3>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-sm">
                        <DetailItem label="Email" value={user.email} />
                        <DetailItem label="Phone Number" value={user.phone} />
                    </dl>
                </div>
            )}

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
    );
    
    const TabButton: React.FC<{ label: string; isActive: boolean; onClick: () => void; }> = ({ label, isActive, onClick }) => (
         <button
            onClick={onClick}
            className={`${isActive ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}
        >
            {label}
        </button>
    );

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
                    </div>
                     <div className="flex flex-row flex-wrap gap-2 w-full sm:w-auto">
                        {!isOwnProfile && (
                             <button 
                                onClick={() => onStartChat(user.id)}
                                className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-slate-700 text-white text-sm font-semibold rounded-md hover:bg-slate-600 grow sm:grow-0"
                            >
                                <MessageSquareIcon className="h-4 w-4" />
                                <span>Message</span>
                            </button>
                        )}
                         {!isOwnProfile && (
                            <button
                                onClick={() => setIsReportModalOpen(true)}
                                className="inline-flex items-center justify-center space-x-2 px-4 py-2 bg-red-900/50 text-red-400 text-sm font-semibold rounded-md hover:bg-red-900/80 grow sm:grow-0"
                                title="Report this user"
                            >
                                <FlagIcon className="h-4 w-4" />
                                <span>Report</span>
                            </button>
                         )}
                    </div>
                </div>
            </div>
            
            <div className="mt-4">
                <div className="border-b border-slate-700">
                    <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                        <TabButton label="Activity" isActive={activeTab === 'activity'} onClick={() => setActiveTab('activity')} />
                        <TabButton label="About" isActive={activeTab === 'about'} onClick={() => setActiveTab('about')} />
                        {user.role === 'member' && memberDetails && (
                            <TabButton label="Member Card" isActive={activeTab === 'card'} onClick={() => setActiveTab('card')} />
                        )}
                    </nav>
                </div>
            </div>

            <div className="mt-6">
                {activeTab === 'activity' && (
                    <div className="animate-fade-in">
                         <PostTypeFilter currentFilter={typeFilter} onFilterChange={setTypeFilter} />
                         <PostsFeed 
                            user={currentUser}
                            authorId={user.id}
                            onViewProfile={onViewProfile}
                            typeFilter={typeFilter}
                        />
                    </div>
                )}
                {activeTab === 'about' && renderAboutTab()}
                {activeTab === 'card' && memberDetails && (
                    <div className="animate-fade-in">
                        <MemberCard user={user} memberDetails={memberDetails} />
                    </div>
                )}
            </div>
        </div>
    );
};