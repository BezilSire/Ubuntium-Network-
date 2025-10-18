import React, { useState } from 'react';
import { User, Post } from '../types';
import { api } from '../services/apiService';
import { XCircleIcon } from './icons/XCircleIcon';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { UsersIcon } from './icons/UsersIcon';
import { MessageSquareIcon } from './icons/MessageSquareIcon';


interface NewPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onPostCreated: () => void;
}

const PostTypeButton: React.FC<{
    label: string;
    icon: React.ReactNode;
    value: Post['type'];
    currentValue: Post['type'];
    onClick: (value: Post['type']) => void;
}> = ({ label, icon, value, currentValue, onClick }) => (
    <button
        onClick={() => onClick(value)}
        className={`flex-1 flex flex-col items-center justify-center p-3 rounded-lg transition-colors duration-200 space-y-1 text-sm
            ${currentValue === value ? 'bg-green-600/20 text-green-300' : 'bg-slate-800 hover:bg-slate-700 text-gray-300'}
        `}
    >
        {icon}
        <span>{label}</span>
    </button>
);


const MAX_POST_LENGTH = 500;

export const NewPostModal: React.FC<NewPostModalProps> = ({ isOpen, onClose, user, onPostCreated }) => {
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<Post['type']>('general');
  const [isPosting, setIsPosting] = useState(false);

  if (!isOpen) {
    return null;
  }

  const handlePost = async () => {
    if (!content.trim()) return;
    setIsPosting(true);
    try {
      await api.createPost(user, content, postType);
      setContent('');
      setPostType('general');
      onPostCreated();
    } catch (error) {
      console.error("Failed to create post:", error);
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 bg-black bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onClose}></div>
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
        <div className="inline-block align-bottom bg-slate-900 rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="flex items-center justify-between p-4 border-b border-slate-700">
             <h3 className="text-lg font-bold text-white">Create a Post</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Close">
                <XCircleIcon className="h-6 w-6"/>
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-start space-x-3">
                <UserCircleIcon className="h-10 w-10 text-gray-400 flex-shrink-0" />
                <div className="w-full">
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full bg-slate-800 p-2 rounded-md text-white border border-slate-700 focus:ring-green-500 focus:border-green-500 placeholder-gray-500 text-base"
                        rows={6}
                        placeholder={`What's on your mind, ${user.name}?`}
                        maxLength={MAX_POST_LENGTH}
                        autoFocus
                    />
                    <div className="text-right text-xs text-gray-400 mt-1">
                        {content.length} / {MAX_POST_LENGTH}
                    </div>
                </div>
            </div>
            
            <div className="pt-2">
                <div className="flex items-center justify-around space-x-2">
                    <PostTypeButton label="General" icon={<MessageSquareIcon className="h-5 w-5"/>} value="general" currentValue={postType} onClick={setPostType} />
                    <PostTypeButton label="Proposal" icon={<LightbulbIcon className="h-5 w-5"/>} value="proposal" currentValue={postType} onClick={setPostType} />
                    <PostTypeButton label="Offer" icon={<UsersIcon className="h-5 w-5"/>} value="offer" currentValue={postType} onClick={setPostType} />
                    <PostTypeButton label="Opportunity" icon={<BriefcaseIcon className="h-5 w-5"/>} value="opportunity" currentValue={postType} onClick={setPostType} />
                </div>
            </div>
          </div>
          <div className="bg-slate-800 px-4 py-3 flex justify-end items-center">
            <button
              type="button"
              disabled={isPosting || !content.trim()}
              className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-6 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-green-500 disabled:bg-slate-500"
              onClick={handlePost}
            >
              {isPosting ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};