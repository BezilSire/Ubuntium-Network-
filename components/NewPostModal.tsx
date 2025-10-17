import React, { useState } from 'react';
import { User, Post } from '../types';
import { api } from '../services/apiService';

interface NewPostModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  onPostCreated: () => void;
}

export const NewPostModal: React.FC<NewPostModalProps> = ({ isOpen, onClose, user, onPostCreated }) => {
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<'general' | 'proposal' | 'offer' | 'opportunity'>('general');
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
          <div className="p-6">
            <h3 className="text-lg font-bold text-white text-center mb-4">New Post</h3>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-slate-800 p-3 rounded-md text-white border border-slate-700 focus:ring-green-500 focus:border-green-500 placeholder-gray-500"
              rows={5}
              placeholder={`What's on your mind, ${user.name}?`}
              autoFocus
            />
             <div className="flex items-center space-x-4 flex-wrap gap-y-2 mt-4">
                <label className="flex items-center space-x-2 text-sm text-gray-300">
                    <input type="radio" name="postType" value="general" checked={postType === 'general'} onChange={() => setPostType('general')} className="text-green-600 bg-slate-900 border-slate-600 focus:ring-green-500"/>
                    <span>General</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-300">
                    <input type="radio" name="postType" value="proposal" checked={postType === 'proposal'} onChange={() => setPostType('proposal')} className="text-green-600 bg-slate-900 border-slate-600 focus:ring-green-500"/>
                    <span>Proposal</span>
                </label>
                 <label className="flex items-center space-x-2 text-sm text-gray-300">
                    <input type="radio" name="postType" value="offer" checked={postType === 'offer'} onChange={() => setPostType('offer')} className="text-green-600 bg-slate-900 border-slate-600 focus:ring-green-500"/>
                    <span>Offer</span>
                </label>
                <label className="flex items-center space-x-2 text-sm text-gray-300">
                    <input type="radio" name="postType" value="opportunity" checked={postType === 'opportunity'} onChange={() => setPostType('opportunity')} className="text-green-600 bg-slate-900 border-slate-600 focus:ring-green-500"/>
                    <span>Opportunity</span>
                </label>
            </div>
          </div>
          <div className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex justify-between items-center">
            <button
                type="button"
                className="text-sm text-gray-400 hover:text-white"
                onClick={onClose}
              >
                Cancel
              </button>
            <button
              type="button"
              disabled={isPosting || !content.trim()}
              className="inline-flex justify-center rounded-full px-5 py-2 bg-white text-black text-sm font-bold hover:bg-gray-200 disabled:bg-slate-500 disabled:text-slate-800"
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
