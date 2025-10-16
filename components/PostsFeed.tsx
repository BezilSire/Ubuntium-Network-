import React, { useState, useEffect } from 'react';
import { Post, User, MemberUser } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { formatTimeAgo } from '../utils';
import { ThumbsUpIcon } from './icons/ThumbsUpIcon';
import { TrashIcon } from './icons/TrashIcon';
import { PencilIcon } from './icons/PencilIcon';
import { EditPostModal } from './EditPostModal';
import { UsersIcon } from './icons/UsersIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { FlagIcon } from './icons/FlagIcon';
import { ReportPostModal } from './ReportPostModal';
import { ConfirmationDialog } from './ConfirmationDialog';

interface PostsFeedProps {
  user: User;
  filter: 'all' | 'proposals' | 'distress' | 'offers' | 'opportunities';
  isAdminView?: boolean;
  onViewProfile: (userId: string) => void;
}

export const PostItem: React.FC<{ 
    post: Post; 
    currentUser: User; 
    onUpvote: (postId: string) => void; 
    onDelete: (post: Post) => void; 
    onEdit: (post: Post) => void;
    onReport: (post: Post) => void;
    onViewProfile: (userId: string) => void;
    isAdminView?: boolean;
}> = 
({ post, currentUser, onUpvote, onDelete, onEdit, onReport, onViewProfile, isAdminView }) => {
    const isOwnPost = post.authorId === currentUser.id;
    const hasUpvoted = post.upvotes.includes(currentUser.id);
  
    return (
        <div className="bg-slate-900/50 p-4 rounded-lg">
            <div className="flex justify-between items-start">
                <div>
                    <button onClick={() => post.authorId && onViewProfile(post.authorId)} className="font-bold text-white hover:underline text-left">
                        {post.authorName}
                    </button>
                    <p className="text-xs text-gray-400">{post.authorCircle} • {formatTimeAgo(post.date)}</p>
                </div>
                {post.type === 'proposal' && <span className="text-xs font-bold bg-blue-800 text-blue-300 px-2 py-1 rounded-full">PROPOSAL</span>}
                {post.type === 'offer' && <span className="text-xs font-bold bg-green-800 text-green-300 px-2 py-1 rounded-full flex items-center"><UsersIcon className="h-3 w-3 mr-1"/>OFFER</span>}
                {post.type === 'opportunity' && <span className="text-xs font-bold bg-purple-800 text-purple-300 px-2 py-1 rounded-full flex items-center"><BriefcaseIcon className="h-3 w-3 mr-1"/>OPPORTUNITY</span>}
                {post.type === 'distress' && <span className="text-xs font-bold bg-red-800 text-red-300 px-2 py-1 rounded-full animate-pulse">DISTRESS</span>}
            </div>
            <p className="my-3 text-gray-300 whitespace-pre-wrap">{post.content}</p>
            <div className="flex justify-between items-center mt-2">
                <div className="flex items-center space-x-4">
                    <button onClick={() => onUpvote(post.id)} className={`flex items-center space-x-1.5 text-sm ${hasUpvoted ? 'text-green-400' : 'text-gray-400 hover:text-green-400'}`}>
                        <ThumbsUpIcon className="h-4 w-4" />
                        <span>{post.upvotes.length}</span>
                    </button>
                    {post.type === 'opportunity' && !isOwnPost && (
                        <button onClick={() => onReport(post)} className="flex items-center space-x-1.5 text-sm text-gray-400 hover:text-red-400" title="Report this opportunity">
                            <FlagIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>
                {(isOwnPost || isAdminView) && (
                    <div className="flex items-center space-x-3">
                        {isOwnPost && post.type !== 'distress' && (
                            <button onClick={() => onEdit(post)} className="text-gray-400 hover:text-white" title="Edit post"><PencilIcon className="h-4 w-4" /></button>
                        )}
                        <button onClick={() => onDelete(post)} className="text-gray-400 hover:text-red-400" title="Delete post"><TrashIcon className="h-4 w-4" /></button>
                    </div>
                )}
            </div>
        </div>
    );
};


export const PostsFeed: React.FC<PostsFeedProps> = ({ user, filter, isAdminView = false, onViewProfile }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newPostContent, setNewPostContent] = useState('');
  const [newPostType, setNewPostType] = useState<'general' | 'proposal' | 'offer' | 'opportunity'>('general');
  const [postToEdit, setPostToEdit] = useState<Post | null>(null);
  const [postToReport, setPostToReport] = useState<Post | null>(null);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);

  const { addToast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = api.listenForPosts(filter, (fetchedPosts) => {
      setPosts(fetchedPosts);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [filter]);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPostContent.trim()) return;

    try {
        await api.createPost(user, newPostContent, newPostType);
        setNewPostContent('');
        setNewPostType('general');
        addToast("Post created successfully!", "success");
    } catch (error) {
        addToast("Failed to create post.", "error");
    }
  };

  const handleUpvote = async (postId: string) => {
    try {
        await api.upvotePost(postId, user.id);
    } catch (error) {
        addToast("Could not process upvote.", "error");
    }
  };
  
  const handleConfirmDelete = async () => {
    if (!postToDelete) return;
    try {
        if (postToDelete.type === 'distress') {
            await api.deleteDistressPost(postToDelete.id, postToDelete.authorId);
        } else {
            await api.deletePost(postToDelete.id);
        }
        addToast("Post deleted.", "info");
    } catch (error) {
        addToast("Failed to delete post.", "error");
    } finally {
        setPostToDelete(null);
    }
  };
  
  const handleSaveEdit = async (postId: string, content: string) => {
    try {
        await api.updatePost(postId, content);
        setPostToEdit(null);
        addToast("Post updated successfully!", "success");
    } catch (error) {
        addToast("Failed to update post.", "error");
    }
  };

  const handleReportSubmit = async (reason: string, details: string) => {
      if (!postToReport) return;
      try {
          await api.reportPost(user, postToReport, reason, details);
          addToast("Report submitted. An admin will review it shortly.", "success");
      } catch (error) {
          addToast("Failed to submit report.", "error");
      }
  };

  const canPost = user.role === 'member' && (user as MemberUser).status === 'active';

  return (
    <div className="space-y-6">
      {canPost && filter !== 'distress' && (
        <form onSubmit={handleCreatePost} className="bg-slate-800 p-4 rounded-lg">
          <textarea
            value={newPostContent}
            onChange={(e) => setNewPostContent(e.target.value)}
            className="w-full bg-slate-700 p-2 rounded-md text-white focus:ring-green-500 focus:border-green-500"
            rows={3}
            placeholder="Share something with the community..."
          />
          <div className="flex justify-between items-center mt-2">
            <div>
              {filter === 'all' && (
                <div className="flex items-center space-x-4 flex-wrap gap-y-2">
                    <label className="flex items-center space-x-2 text-sm text-gray-300">
                        <input type="radio" name="postType" value="general" checked={newPostType === 'general'} onChange={() => setNewPostType('general')} className="text-green-600 bg-slate-900 border-slate-600 focus:ring-green-500"/>
                        <span>General Post</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm text-gray-300">
                        <input type="radio" name="postType" value="proposal" checked={newPostType === 'proposal'} onChange={() => setNewPostType('proposal')} className="text-green-600 bg-slate-900 border-slate-600 focus:ring-green-500"/>
                        <span>Proposal</span>
                    </label>
                     <label className="flex items-center space-x-2 text-sm text-gray-300">
                        <input type="radio" name="postType" value="offer" checked={newPostType === 'offer'} onChange={() => setNewPostType('offer')} className="text-green-600 bg-slate-900 border-slate-600 focus:ring-green-500"/>
                        <span>Offer Help</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm text-gray-300">
                        <input type="radio" name="postType" value="opportunity" checked={newPostType === 'opportunity'} onChange={() => setNewPostType('opportunity')} className="text-green-600 bg-slate-900 border-slate-600 focus:ring-green-500"/>
                        <span>Opportunity</span>
                    </label>
                </div>
              )}
            </div>
            <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700">Post</button>
          </div>
        </form>
      )}

      {isLoading ? (
        <p className="text-center text-gray-400">Loading posts...</p>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map(post => (
            <PostItem key={post.id} post={post} currentUser={user} onUpvote={handleUpvote} onDelete={setPostToDelete} onEdit={setPostToEdit} onReport={setPostToReport} isAdminView={isAdminView} onViewProfile={onViewProfile} />
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-400 py-8">No posts found in this category.</p>
      )}

      {postToEdit && (
        <EditPostModal
            isOpen={!!postToEdit}
            onClose={() => setPostToEdit(null)}
            post={postToEdit}
            onSave={handleSaveEdit}
        />
      )}

      {postToReport && (
          <ReportPostModal
            isOpen={!!postToReport}
            onClose={() => setPostToReport(null)}
            post={postToReport}
            onReportSubmit={handleReportSubmit}
          />
      )}

      {postToDelete && (
        <ConfirmationDialog
            isOpen={!!postToDelete}
            onClose={() => setPostToDelete(null)}
            onConfirm={handleConfirmDelete}
            title="Delete Post?"
            message="Are you sure you want to delete this post? This action cannot be undone."
            confirmButtonText="Delete"
        />
      )}
    </div>
  );
};