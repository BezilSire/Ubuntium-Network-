import React, { useState, useEffect } from 'react';
import { User, MemberUser, Conversation } from '../types';
import { api } from '../services/apiService';
import { ConversationList } from './ConversationList';
import { ChatWindow } from './ChatWindow';
import { MemberSearchModal } from './MemberSearchModal';
import { MessageSquareIcon } from './icons/MessageSquareIcon';
import { ChatHeader } from './ChatHeader';
import { CreateGroupModal } from './CreateGroupModal';
import { GroupInfoPanel } from './GroupInfoPanel';

interface ConnectPageProps {
  user: User;
  initialTarget?: Conversation | null;
  onViewProfile: (userId: string) => void;
}

export const ConnectPage: React.FC<ConnectPageProps> = ({ user, initialTarget, onViewProfile }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [isNewGroupModalOpen, setIsNewGroupModalOpen] = useState(false);
  const [isGroupInfoPanelOpen, setIsGroupInfoPanelOpen] = useState(false);
  const [chatContacts, setChatContacts] = useState<User[]>([]);

  useEffect(() => {
    if (user.role === 'member' && (user as MemberUser).status !== 'active') return;
    const unsubscribe = api.listenForConversations(user.id, (convos) => {
      setConversations(convos);
    });
    return () => unsubscribe();
  }, [user.id, user.role, (user as MemberUser).status]);
  
  useEffect(() => {
    api.getChatContacts(user, false).then(setChatContacts);
  }, [user]);

  useEffect(() => {
    if (initialTarget) {
      setSelectedConversation(initialTarget);
    }
  }, [initialTarget]);

  const handleSelectConversation = async (convo: Conversation) => {
    setSelectedConversation(convo);
    if (convo.isGroup) {
      if (!isGroupInfoPanelOpen || selectedConversation?.id !== convo.id) {
        setIsGroupInfoPanelOpen(false);
      }
    } else {
      setIsGroupInfoPanelOpen(false);
    }
  };

  const handleNewChatSelect = (newConversation: Conversation) => {
    // Optimistically add to the list if it's not there to prevent flicker
    if (!conversations.some(c => c.id === newConversation.id)) {
        setConversations(prev => [newConversation, ...prev]);
    }
    setSelectedConversation(newConversation);
    setIsNewChatModalOpen(false);
  };
  
  return (
    <div className="flex h-[calc(100vh-170px)] bg-slate-800 rounded-lg shadow-lg overflow-hidden">
      <MemberSearchModal 
        isOpen={isNewChatModalOpen} 
        onClose={() => setIsNewChatModalOpen(false)}
        currentUser={user}
        onSelectUser={handleNewChatSelect}
        usersForSearch={chatContacts}
      />
      <CreateGroupModal
        isOpen={isNewGroupModalOpen}
        onClose={() => setIsNewGroupModalOpen(false)}
        currentUser={user}
      />
      <aside className="w-full md:w-1/3 border-r border-slate-700 flex-shrink-0">
        <ConversationList
          conversations={conversations}
          currentUser={user}
          onSelectConversation={handleSelectConversation}
          onNewChat={() => setIsNewChatModalOpen(true)}
          onNewGroup={() => setIsNewGroupModalOpen(true)}
          selectedConversationId={selectedConversation?.id}
        />
      </aside>
      <main className="flex-1 flex flex-col">
        {selectedConversation ? (
            <>
                <ChatHeader 
                    conversation={selectedConversation} 
                    currentUser={user} 
                    onShowInfo={() => setIsGroupInfoPanelOpen(p => !p)} 
                    onViewProfile={onViewProfile}
                />
                <div className="flex flex-1 overflow-hidden">
                    <ChatWindow conversation={selectedConversation} currentUser={user} />
                    {selectedConversation.isGroup && isGroupInfoPanelOpen && (
                        <GroupInfoPanel
                            isOpen={isGroupInfoPanelOpen}
                            onClose={() => setIsGroupInfoPanelOpen(false)}
                            conversation={selectedConversation}
                            currentUser={user}
                        />
                    )}
                </div>
            </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400 p-4">
            <MessageSquareIcon className="h-16 w-16 mb-4 text-slate-600" />
            <h3 className="text-xl font-semibold text-white">Select a conversation</h3>
            <p>Or start a new one to connect with other members.</p>
          </div>
        )}
      </main>
    </div>
  );
};
