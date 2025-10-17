import React, { useState, useEffect } from 'react';
import { MemberUser, Member, Broadcast, Post, User, Conversation, NotificationItem } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { MegaphoneIcon } from './icons/MegaphoneIcon';
import { UsersIcon } from './icons/UsersIcon';
import { GlobeIcon } from './icons/GlobeIcon';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { MemberProfile } from './MemberProfile';
import { PostsFeed } from './PostsFeed';
import { formatTimeAgo } from '../utils';
import { SirenIcon } from './icons/SirenIcon';
import { DistressCallDialog } from './DistressCallDialog';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { LayoutDashboardIcon } from './icons/LayoutDashboardIcon';
import { ConnectPage } from './ConnectPage';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { PublicProfile } from './PublicProfile';
import { BellIcon } from './icons/BellIcon';
import { NotificationsPage } from './NotificationsPage';


interface MemberDashboardProps {
  user: MemberUser;
  broadcasts: Broadcast[];
  onUpdateUser: (updatedUser: Partial<User>) => Promise<void>;
  unreadCount: number;
}

type MemberView = 'dashboard' | 'connect' | 'profile' | 'notifications';
type FeedFilter = 'all' | 'proposals' | 'offers' | 'opportunities';

const DashboardView: React.FC<{ 
    user: MemberUser; 
    broadcasts: Broadcast[]; 
    onUpdateUser: (updatedUser: Partial<User>) => Promise<void>;
    onViewProfile: (userId: string) => void;
}> = ({ user, broadcasts, onUpdateUser, onViewProfile }) => {
    const { addToast } = useToast();
    const [membersInCircle, setMembersInCircle] = useState<User[]>([]);
    const [newestMembers, setNewestMembers] = useState<User[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDistressDialogOpen, setIsDistressDialogOpen] = useState(false);
    const [isSendingDistressCall, setIsSendingDistressCall] = useState(false);
    const [feedFilter, setFeedFilter] = useState<FeedFilter>('all');

    useEffect(() => {
        const fetchCircleMembers = async () => {
        try {
            const members = await api.getMembersInCircle(user.circle);
            setMembersInCircle(members);
        } catch (error) {
            addToast("Could not load members in your circle.", "error");
            console.error("Could not load members in your circle:", error);
        }
        };

        setIsLoading(true);
        fetchCircleMembers().finally(() => setIsLoading(false));

        const unsubscribeNewMembers = api.listenForNewMembersInCircle(user.circle, (members) => {
            setNewestMembers(members);
        });

        return () => {
            unsubscribeNewMembers();
        };
    }, [user.circle, addToast]);

     const handleSendDistressPost = async (content: string) => {
        if (!content.trim()) {
            addToast("Please describe your situation.", "error");
            return;
        }
        setIsSendingDistressCall(true);
        try {
            const updatedUser = await api.createDistressPost(content);
            onUpdateUser(updatedUser);
            addToast("Distress post sent. Members in your circle and admins have been notified.", "success");
            setIsDistressDialogOpen(false);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            addToast(`Failed to send distress post: ${errorMessage}`, "error");
        } finally {
            setIsSendingDistressCall(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto animate-fade-in">
            <DistressCallDialog
                isOpen={isDistressDialogOpen}
                onClose={() => setIsDistressDialogOpen(false)}
                onConfirm={handleSendDistressPost}
                isLoading={isSendingDistressCall}
            />
            <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white">Welcome, {user.name}!</h1>
                    <p className="text-lg text-gray-400">Your portal to the Ubuntium Global Commons.</p>
                </div>
                <div className="flex items-center space-x-4 w-full sm:w-auto">
                    <div className="flex-1 text-right">
                        <button
                            onClick={() => setIsDistressDialogOpen(true)}
                            disabled={user.distress_calls_available <= 0}
                            className={`inline-flex items-center justify-center space-x-2 px-3 py-2 w-full text-white text-sm rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 
                                ${user.distress_calls_available > 0 
                                    ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 animate-pulse' 
                                    : 'bg-slate-600 cursor-not-allowed'
                                }`}
                        >
                            <SirenIcon className="h-5 w-5" />
                            <span>Distress Call ({user.distress_calls_available})</span>
                        </button>
                    </div>
                </div>
            </div>

            {user.status === 'pending' && (
                <div className="mt-6 p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-center">
                    <p className="font-bold text-yellow-200">Your Account is Pending Approval</p>
                    <p className="text-sm text-yellow-300 mt-1">
                        An administrator is reviewing your registration. Once approved, you will have full access. For now, you can receive messages but cannot send them.
                    </p>
                </div>
            )}
            
            <div className="mt-8">
                <div className="mb-4 border-b border-slate-700">
                    <div className="flex space-x-4 overflow-x-auto pb-1">
                        <button onClick={() => setFeedFilter('all')} className={`${feedFilter === 'all' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200'} flex items-center space-x-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                            <MessageSquareIcon className="h-5 w-5"/>
                            <span>All Posts</span>
                        </button>
                        <button onClick={() => setFeedFilter('proposals')} className={`${feedFilter === 'proposals' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200'} flex items-center space-x-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                             <LightbulbIcon className="h-5 w-5"/>
                            <span>Proposals</span>
                        </button>
                         <button onClick={() => setFeedFilter('offers')} className={`${feedFilter === 'offers' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200'} flex items-center space-x-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                             <UsersIcon className="h-5 w-5"/>
                            <span>Offers</span>
                        </button>
                        <button onClick={() => setFeedFilter('opportunities')} className={`${feedFilter === 'opportunities' ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200'} flex items-center space-x-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                             <BriefcaseIcon className="h-5 w-5"/>
                            <span>Opportunities</span>
                        </button>
                    </div>
                </div>
                <PostsFeed user={user} filter={feedFilter} onViewProfile={onViewProfile} />
            </div>

            <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
                            <UsersIcon className="h-5 w-5 mr-2 text-green-400" />
                            Members in {user.circle}
                        </h3>
                        {isLoading ? (
                            <p className="text-gray-400">Loading members...</p>
                        ) : membersInCircle.length > 0 ? (
                            <ul className="space-y-3 max-h-96 overflow-y-auto">
                                {membersInCircle.map(member => (
                                    <li key={member.id} className="w-full text-left flex items-center justify-between p-2 bg-slate-700/50 rounded-md">
                                        <span className="font-medium text-white">{member.name}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-400">No other approved members found in your circle yet.</p>
                        )}
                    </div>
                </div>

                <div className="space-y-8">
                    <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
                            <GlobeIcon className="h-5 w-5 mr-2 text-green-400" />
                            Newest Members in {user.circle}
                        </h3>
                        <ul className="space-y-3 max-h-[26rem] overflow-y-auto">
                            {newestMembers.map(member => (
                                <li key={member.id} className="border-b border-slate-700 pb-2 animate-fade-in">
                                    <p className="font-medium text-sm text-white">
                                        {member.id === user.id ? 'You' : member.name}
                                    </p>
                                    <p className="text-xs text-gray-400">from {member.circle}</p>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="bg-slate-800 p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-semibold text-gray-200 mb-4 flex items-center">
                            <MegaphoneIcon className="h-5 w-5 mr-2 text-green-400"/>
                            Admin Broadcasts
                        </h3>
                        <ul className="space-y-4 max-h-96 overflow-y-auto">
                            {broadcasts.length > 0 ? broadcasts.map(b => (
                            <li key={b.id} className="border-b border-slate-700 pb-3">
                                <p className="text-sm text-gray-300">{b.message}</p>
                                <p className="text-xs text-gray-500 mt-1">{new Date(b.date).toLocaleDateString()}</p>
                            </li>
                            )) : <p className="text-sm text-gray-400">No broadcasts yet.</p>}
                        </ul>
                    </div>
                </div>
            </div>
        </div>
    );
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({ user, broadcasts, onUpdateUser, unreadCount }) => {
  const [view, setView] = useState<MemberView>('dashboard');
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const { addToast } = useToast();
  
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [chatTarget, setChatTarget] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  

  useEffect(() => {
    if (user.status === 'active') {
        const unsubscribe = api.listenForConversations(user.id, (conversations) => {
            setConversations(conversations);
            const count = conversations.filter(c => !c.readBy.includes(user.id) && c.lastMessageSenderId !== user.id).length;
            setUnreadChatCount(count);
        });
        return () => unsubscribe();
    }
  }, [user.id, user.status]);
  
  // Clear the initial chat target when navigating away from the connect page
  useEffect(() => {
    if (view !== 'connect') {
      setChatTarget(null);
    }
  }, [view]);

  const handleStartChat = async (targetUserId: string) => {
      try {
        const targetUser = await api.getUserProfile(targetUserId);
        if (!targetUser) {
            addToast("Could not find user to chat with.", "error");
            return;
        }
        const newConvo = await api.startChat(user.id, targetUserId, user.name, targetUser.name);
        setChatTarget(newConvo);
        setViewingProfileId(null); // Close profile view
        setView('connect'); // Switch to connect tab
      } catch (error) {
        addToast("Failed to start chat.", "error");
      }
  };

  const handleNavigate = (item: NotificationItem) => {
      switch (item.type) {
          case 'NEW_MESSAGE':
          case 'NEW_CHAT':
              const convo = conversations.find(c => c.id === item.link);
              if (convo) {
                  setChatTarget(convo);
                  setView('connect');
              } else {
                  addToast("Could not find the conversation.", "error");
              }
              break;
          case 'POST_LIKE':
          case 'NEW_MEMBER':
          case 'NEW_POST_OPPORTUNITY':
          case 'NEW_POST_PROPOSAL':
              // For post likes, navigate to the liker's profile. For others, navigate to the subject's profile.
              const profileId = item.type === 'POST_LIKE' ? item.causerId : item.link;
              setViewingProfileId(profileId);
              break;
          default:
              addToast("Navigation for this notification is not available.", "info");
      }
  };

  if (viewingProfileId) {
    return (
        <PublicProfile 
            userId={viewingProfileId} 
            currentUserId={user.id} 
            onBack={() => setViewingProfileId(null)}
            onStartChat={handleStartChat}
            onViewProfile={setViewingProfileId}
        />
    );
  }

  const renderContent = () => {
    switch (view) {
        case 'dashboard':
            return <DashboardView user={user} broadcasts={broadcasts} onUpdateUser={onUpdateUser} onViewProfile={setViewingProfileId} />;
        case 'connect':
            return <ConnectPage user={user} initialTarget={chatTarget} onViewProfile={setViewingProfileId} />;
        case 'profile':
            return <MemberProfile memberId={user.member_id} currentUserId={user.id} onBack={() => setView('dashboard')} onUpdateUser={onUpdateUser} />;
        case 'notifications':
            return <NotificationsPage user={user} onNavigate={handleNavigate} />;
        default:
            return null;
    }
  }

  return (
    <div className="max-w-7xl mx-auto">
        <div className="mb-6 border-b border-slate-700">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                <TabButton icon={<LayoutDashboardIcon/>} label="Dashboard" isActive={view === 'dashboard'} onClick={() => setView('dashboard')} />
                <TabButton icon={<MessageSquareIcon/>} label="Connect" count={unreadChatCount} isActive={view === 'connect'} onClick={() => setView('connect')} />
                <TabButton icon={<BellIcon/>} label="Notifications" count={unreadCount} isActive={view === 'notifications'} onClick={() => setView('notifications')} />
                <TabButton icon={<UserCircleIcon/>} label="My Profile" isActive={view === 'profile'} onClick={() => setView('profile')} />
            </nav>
        </div>
        {renderContent()}
    </div>
  );
};


const TabButton: React.FC<{icon: React.ReactNode, label: string, count?: number, isActive: boolean, onClick: () => void}> = ({ icon, label, count, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`${
            isActive ? 'border-green-500 text-green-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
        } group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200`}
    >
        <span className="mr-2 h-5 w-5">{icon}</span>
        <span>{label}</span>
        {count !== undefined && count > 0 && (
            <span className="ml-2 flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full">
                {count}
            </span>
        )}
    </button>
);