import React, { useState, useEffect } from 'react';
import { Post, User } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { formatTimeAgo } from '../utils';
import { HeartIcon } from './icons/HeartIcon';
import { TrashIcon } from './icons/TrashIcon';
import { PencilIcon } from './icons/PencilIcon';
import { EditPostModal } from './EditPostModal';
import { FlagIcon } from './icons/FlagIcon';
import { ReportPostModal } from './ReportPostModal';
import { ConfirmationDialog } from './ConfirmationDialog';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { MessageCircleIcon } from './icons/MessageCircleIcon';
import { RepeatIcon } from './icons/RepeatIcon';
import { SendIcon } from './icons/SendIcon';

interface PostsFeedProps {
  user: User;
  // Fix: Added 'general' to the filter type to match the Post type definition.
  filter?: 'all' | 'proposals' | 'distress' | 'offers' | 'opportunities' | 'general';
  authorId?: string;
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
    const { addToast } = useToast();
    const isOwnPost = post.authorId === currentUser.id;
    const hasUpvoted = post.upvotes.includes(currentUser.id);
  
    const handlePlaceholderClick = (feature: string) => {
        addToast(`${feature} is not yet implemented.`, 'info');
    };

    return (
        <div className="flex space-x-3 p-4 border-b border-slate-800">
            {/* Left column: Avatar and connector line */}
            <div className="flex-shrink-0">
                <div className="relative">
                    <UserCircleIcon className="h-10 w-10 text-gray-400" />
                    {/* Future: Add connector line here if needed */}
                </div>
            </div>

            {/* Right column: Post content */}
            <div className="flex-1">
                <div className="flex justify-between items-center">
                    <button onClick={() => post.authorId && onViewProfile(post.authorId)} className="font-semibold text-white hover:underline text-left">
                        {post.authorName}
                    </button>
                    <p className="text-xs text-gray-500 flex-shrink-0 ml-2">{formatTimeAgo(post.date)}</p>
                </div>

                <p className="my-1 text-gray-200 whitespace-pre-wrap">{post.content}</p>

                {/* Action Icons */}
                <div className="flex items-center space-x-6 mt-3 text-gray-400">
                    <button onClick={() => onUpvote(post.id)} className={`flex items-center space-x-1.5 group ${hasUpvoted ? 'text-red-500' : ''}`}>
                        <HeartIcon className={`h-5 w-5 group-hover:text-red-500 transition-colors ${hasUpvoted ? 'fill-current' : 'fill-none'}`} />
                    </button>
                    <button onClick={() => handlePlaceholderClick('Replying')} className="flex items-center space-x-1.5 group">
                        <MessageCircleIcon className="h-5 w-5 group-hover:text-white transition-colors" />
                    </button>
                    <button onClick={() => handlePlaceholderClick('Reposting')} className="flex items-center space-x-1.5 group">
                        <RepeatIcon className="h-5 w-5 group-hover:text-white transition-colors" />
                    </button>
                    <button onClick={() => handlePlaceholderClick('Sharing')} className="flex items-center space-x-1.5 group">
                        <SendIcon className="h-5 w-5 group-hover:text-white transition-colors" />
                    </button>
                </div>
                
                {/* Stats */}
                <div className="flex items-center space-x-4 text-xs text-gray-500 mt-2">
                    <span>{(post.replies || []).length} replies</span>
                    <span>•</span>
                    <span>{post.upvotes.length} likes</span>
                </div>
            </div>
             {(isOwnPost || isAdminView) && (
                <div className="flex items-center space-x-3">
                    {isOwnPost && post.type !== 'distress' && (
                        <button onClick={() => onEdit(post)} className="text-gray-500 hover:text-white" title="Edit post"><PencilIcon className="h-4 w-4" /></button>
                    )}
                    <button onClick={() => onDelete(post)} className="text-gray-500 hover:text-red-400" title="Delete post"><TrashIcon className="h-4 w-4" /></button>
                </div>
            )}
        </div>
    );
};


export const PostsFeed: React.FC<PostsFeedProps> = ({ user, filter = 'all', authorId, isAdminView = false, onViewProfile }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [postToEdit, setPostToEdit] = useState<Post | null>(null);
  const [postToReport, setPostToReport] = useState<Post | null>(null);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);

  const { addToast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    let unsubscribe: () => void;
    if (authorId) {
        unsubscribe = api.listenForPostsByAuthor(authorId, (fetchedPosts) => {
            setPosts(fetchedPosts);
            setIsLoading(false);
        });
    } else {
        unsubscribe = api.listenForPosts(filter, (fetchedPosts) => {
            setPosts(fetchedPosts);
            setIsLoading(false);
        });
    }

    return () => unsubscribe();
  }, [filter, authorId]);


  const handleUpvote = async (postId: string) => {
    try {
        await api.upvotePost(postId, user.id);
    } catch (error) {
        addToast("Could not process like.", "error");
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

  return (
    <div className="space-y-0">
      {isLoading ? (
        <p className="text-center text-gray-400 py-12">Loading feed...</p>
      ) : posts.length > 0 ? (
        <div className="space-y-0">
          {posts.map(post => (
            <PostItem key={post.id} post={post} currentUser={user} onUpvote={handleUpvote} onDelete={setPostToDelete} onEdit={setPostToEdit} onReport={setPostToReport} isAdminView={isAdminView} onViewProfile={onViewProfile} />
          ))}
        </div>
      ) : (
        <p className="text-center text-gray-500 py-12">{authorId ? "This user hasn't made any posts yet." : "It's quiet in here... be the first to post!"}</p>
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