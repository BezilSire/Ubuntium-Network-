import React, { useState, useEffect } from 'react';
import { Post, User } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
import { formatTimeAgo } from '../utils';
import { ThumbsUpIcon } from './icons/ThumbsUpIcon';
import { TrashIcon } from './icons/TrashIcon';
import { PencilIcon } from './icons/PencilIcon';
import { EditPostModal } from './EditPostModal';
import { FlagIcon } from './icons/FlagIcon';
import { ReportPostModal } from './ReportPostModal';
import { ConfirmationDialog } from './ConfirmationDialog';
import { UserCircleIcon } from './icons/UserCircleIcon';
import { SirenIcon } from './icons/SirenIcon';


interface PostsFeedProps {
  user: User;
  // FIX: Tie filter type directly to Post['type'] to prevent widening to string.
  filter?: Post['type'] | 'all';
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
    const isOwnPost = post.authorId === currentUser.id;
    const hasUpvoted = post.upvotes.includes(currentUser.id);
    const isDistressPost = post.type === 'distress';
  
    return (
        <div className={`bg-slate-800 p-4 rounded-lg shadow-md space-y-3 ${isDistressPost ? 'border-2 border-red-500/80 motion-safe:animate-pulse' : ''}`}>
            {/* Header */}
            <div className="flex items-start space-x-3">
                 {isDistressPost ? 
                    <SirenIcon className="h-10 w-10 text-red-500 flex-shrink-0" />
                    :
                    <button onClick={() => post.authorId && onViewProfile(post.authorId)} className="flex-shrink-0">
                       <UserCircleIcon className="h-10 w-10 text-gray-400" />
                    </button>
                 }
                <div className="flex-1">
                     <button 
                        onClick={() => post.authorId && !isDistressPost && onViewProfile(post.authorId)} 
                        className={`font-semibold text-white ${!isDistressPost ? 'hover:underline' : 'cursor-default'} text-left`}
                        disabled={isDistressPost}
                    >
                        {post.authorName}
                    </button>
                    <p className="text-xs text-gray-500">{post.authorCircle} &bull; {formatTimeAgo(post.date)}</p>
                </div>
                <div className="ml-auto flex items-center space-x-3 text-gray-500">
                    {isDistressPost ? (
                        <>
                            {isAdminView && (
                                <button onClick={() => onDelete(post)} className="hover:text-red-400" title="Delete distress post"><TrashIcon className="h-4 w-4" /></button>
                            )}
                        </>
                    ) : (
                        <>
                            {isOwnPost && (
                                <button onClick={() => onEdit(post)} className="hover:text-white" title="Edit post"><PencilIcon className="h-4 w-4" /></button>
                            )}
                            {(isOwnPost || isAdminView) && (
                                 <button onClick={() => onDelete(post)} className="hover:text-red-400" title="Delete post"><TrashIcon className="h-4 w-4" /></button>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Content */}
            <p className="text-gray-200 whitespace-pre-wrap">{post.content}</p>

            {/* Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                <button 
                    onClick={() => onUpvote(post.id)} 
                    className={`flex items-center space-x-2 transition-colors ${hasUpvoted ? 'text-green-400' : 'text-gray-400 hover:text-green-400'}`}
                >
                    <ThumbsUpIcon className={`h-5 w-5 ${hasUpvoted ? 'fill-current' : ''}`} />
                    <span className="text-sm font-medium">{post.upvotes.length > 0 ? post.upvotes.length : ''}</span>
                </button>

                {isAdminView && isDistressPost && (
                    <button onClick={() => onViewProfile(post.authorId)} className="text-sm font-semibold text-yellow-400 hover:text-yellow-300">
                        View Author (Admin)
                    </button>
                )}
                
                {!isOwnPost && !isDistressPost && (
                    <button onClick={() => onReport(post)} className="flex items-center space-x-2 text-gray-400 hover:text-red-400 transition-colors">
                        <FlagIcon className="h-4 w-4" />
                        <span className="text-sm">Report</span>
                    </button>
                )}
            </div>
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
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-center text-gray-400 py-12">Loading feed...</p>
      ) : posts.length > 0 ? (
        <div className="space-y-4">
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