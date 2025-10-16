import React from 'react';
import { Conversation, User } from '../types';
import { formatTimeAgo } from '../utils';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { UsersIcon } from './icons/UsersIcon';
import { PencilIcon } from './icons/PencilIcon';
import { UsersPlusIcon } from './icons/UsersPlusIcon';

interface ConversationListProps {
  conversations: Conversation[];
  currentUser: User;
  onSelectConversation: (conversation: Conversation) => void;
  onNewChat: () => void;
  onNewGroup: () => void;
  selectedConversationId?: string | null;
}

export const ConversationList: React.FC<ConversationListProps> = ({ conversations, currentUser, onSelectConversation, onNewChat, onNewGroup, selectedConversationId }) => {
  const getOtherMemberName = (convo: Conversation) => {
    if (convo.isGroup) return convo.name;
    const otherMemberId = convo.members.find(id => id !== currentUser.id);
    return convo.memberNames[otherMemberId || ''] || 'Unknown User';
  };

  return (
    <div className="flex flex-col h-full">
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
            <h2 className="text-xl font-bold text-white">Chats</h2>
            <div className="flex items-center space-x-2">
                 <button onClick={onNewGroup} className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-full" title="Create Group Chat">
                    <UsersPlusIcon className="h-5 w-5" />
                </button>
                <button onClick={onNewChat} className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded-full" title="New Chat">
                    <PencilIcon className="h-5 w-5" />
                </button>
            </div>
        </div>
        <div className="flex-1 overflow-y-auto">
            {conversations.length > 0 ? (
                <ul>
                    {conversations.map(convo => {
                        const isUnread = !convo.readBy.includes(currentUser.id) && convo.lastMessageSenderId !== currentUser.id;
                        const isSelected = convo.id === selectedConversationId;
                        return (
                        <li key={convo.id}>
                            <button
                                onClick={() => onSelectConversation(convo)}
                                className={`w-full text-left p-3 flex items-center space-x-3 transition-colors ${isSelected ? 'bg-green-600/20' : 'hover:bg-slate-700/50'}`}
                            >
                                {convo.isGroup ? <UsersIcon className="h-10 w-10 text-gray-400 flex-shrink-0" /> : <UserCircleIcon className="h-10 w-10 text-gray-400 flex-shrink-0" />}
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <p className={`font-semibold truncate ${isUnread ? 'text-white' : 'text-gray-200'}`}>{getOtherMemberName(convo)}</p>
                                        <p className={`text-xs flex-shrink-0 ${isUnread ? 'text-green-400' : 'text-gray-500'}`}>{convo.lastMessageTimestamp ? formatTimeAgo(convo.lastMessageTimestamp.toDate().toISOString()) : ''}</p>
                                    </div>
                                    <p className={`text-sm truncate ${isUnread ? 'text-gray-300 font-medium' : 'text-gray-400'}`}>{convo.lastMessage}</p>
                                </div>
                                {isUnread && <div className="w-2.5 h-2.5 bg-green-500 rounded-full flex-shrink-0 ml-2"></div>}
                            </button>
                        </li>
                    )})}
                </ul>
            ) : (
                <div className="p-4 text-center text-gray-400">No conversations yet.</div>
            )}
        </div>
    </div>
  );
};