import React, { useState, useEffect } from 'react';
import { MemberUser, Broadcast, Post, User, Conversation, NotificationItem } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { MemberProfile } from './MemberProfile';
import { PostsFeed } from './PostsFeed';
import { DistressCallDialog } from './DistressCallDialog';
import { ConnectPage } from './ConnectPage';
import { PublicProfile } from './PublicProfile';
import { NotificationsPage } from './NotificationsPage';
import { MemberBottomNav } from './MemberBottomNav';
import { NewPostModal } from './NewPostModal';

interface MemberDashboardProps {
  user: MemberUser;
  broadcasts: Broadcast[];
  onUpdateUser: (updatedUser: Partial<User>) => Promise<void>;
  unreadCount: number;
}

export const MemberDashboard: React.FC<MemberDashboardProps> = ({ user, broadcasts, onUpdateUser, unreadCount }) => {
  const [activeView, setActiveView] = useState<'feed' | 'connect' | 'notifications' | 'profile'>('feed');
  const [isNewPostOpen, setIsNewPostOpen] = useState(false);
  
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const { addToast } = useToast();
  
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const [chatTarget, setChatTarget] = useState<Conversation | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (user.status === 'active') {
        const unsubscribe = api.listenForConversations(
            user.id, 
            (conversations) => {
                setConversations(conversations);
                const count = conversations.filter(c => !c.readBy.includes(user.id) && c.lastMessageSenderId !== user.id).length;
                setUnreadChatCount(count);
            },
            (error) => {
                console.error("Failed to load conversations:", error);
                addToast("Could not load your conversations.", "error");
            }
        );
        return () => unsubscribe();
    }
  }, [user.id, user.status, addToast]);
  
  const handleStartChat = async (targetUserId: string) => {
      try {
        const targetUser = await api.getUserProfile(targetUserId);
        if (!targetUser) {
            addToast("Could not find user to chat with.", "error");
            return;
        }
        const newConvo = await api.startChat(user.id, targetUserId, user.name, targetUser.name);
        setChatTarget(newConvo);
        setViewingProfileId(null);
        setActiveView('connect');
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
                  setActiveView('connect');
              } else {
                 addToast("Could not find the conversation.", "error");
              }
              break;
          case 'POST_LIKE':
          case 'NEW_MEMBER':
          case 'NEW_POST_OPPORTUNITY':
          case 'NEW_POST_PROPOSAL':
          case 'NEW_POST_OFFER':
          case 'NEW_POST_GENERAL':
              const profileId = item.itemType === 'notification' ? item.causerId : (item.causerId || item.link);
              setViewingProfileId(profileId);
              break;
          default:
              addToast("Navigation for this item is not available.", "info");
      }
  };

  const handlePostCreated = () => {
    setIsNewPostOpen(false);
    setActiveView('feed'); // Switch to home feed to see the new post
    addToast("Post created successfully!", "success");
  }

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
    switch (activeView) {
        case 'feed':
            return <PostsFeed user={user} filter="all" onViewProfile={setViewingProfileId} />;
        case 'connect':
            return <ConnectPage user={user} initialTarget={chatTarget} onViewProfile={setViewingProfileId} />;
        case 'notifications':
            return <NotificationsPage user={user} onNavigate={handleNavigate} onViewProfile={setViewingProfileId}/>;
        case 'profile':
            return <MemberProfile memberId={user.member_id} currentUserId={user.id} onUpdateUser={onUpdateUser} onViewProfile={setViewingProfileId} />;
        default:
            return null;
    }
  }

  return (
    <div className="max-w-4xl mx-auto pb-24">
        <NewPostModal 
            isOpen={isNewPostOpen}
            onClose={() => setIsNewPostOpen(false)}
            user={user}
            onPostCreated={handlePostCreated}
        />
        
        {user.status === 'pending' && (
            <div className="mt-6 p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg text-center mx-4">
                <p className="font-bold text-yellow-200">Your Account is Pending Approval</p>
                <p className="text-sm text-yellow-300 mt-1">
                    An administrator is reviewing your registration. Once approved, you will have full access.
                </p>
            </div>
        )}

        <div className="mt-6">
            {renderContent()}
        </div>

        <MemberBottomNav 
            activeView={activeView}
            setActiveView={setActiveView}
            onNewPostClick={() => setIsNewPostOpen(true)}
            notificationCount={unreadCount + unreadChatCount}
        />
    </div>
  );
};