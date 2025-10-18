import React, { useState, useEffect, useMemo } from 'react';
import { Post, User, Activity } from '../types';
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
import { RepeatIcon } from './icons/RepeatIcon';
import { ShareIcon } from './icons/ShareIcon';
import { RepostModal } from './RepostModal';
import { ActivityItem } from './ActivityItem';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { UsersIcon } from './icons/UsersIcon';

interface PostsFeedProps {
  user: User;
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
    onRepost: (post: Post) => void;
    onShare: (post: Post) => void;
    isAdminView?: boolean;
}> = 
({ post, currentUser, onUpvote, onDelete, onEdit, onReport, onViewProfile, onRepost, onShare, isAdminView }) => {
    const isOwnPost = post.authorId === currentUser.id;
    const hasUpvoted = post.upvotes.includes(currentUser.id);
    const isDistressPost = post.type === 'distress';
  
    const typeStyles: Record<string, { icon: React.ReactNode; borderColor: string; title: string }> = {
        proposal: {
          icon: <LightbulbIcon className="h-5 w-5 text-blue-400" />,
          borderColor: 'border-blue-500/50',
          title: 'Proposal',
        },
        offer: {
          icon: <UsersIcon className="h-5 w-5 text-purple-400" />,
          borderColor: 'border-purple-500/50',
          title: 'Offer',
        },
        opportunity: {
          icon: <BriefcaseIcon className="h-5 w-5 text-yellow-400" />,
          borderColor: 'border-yellow-500/50',
          title: 'Opportunity',
        },
        distress: {
          icon: <SirenIcon className="h-10 w-10 text-red-500 flex-shrink-0" />,
          borderColor: 'border-red-500/80',
          title: 'Distress Signal',
        },
        general: {
          icon: null,
          borderColor: 'border-transparent',
          title: '',
        },
    };

    const style = typeStyles[post.type] || typeStyles.general;

    return (
        <div className={`bg-slate-800 p-4 rounded-lg shadow-md space-y-3 border-l-4 ${style.borderColor} ${isDistressPost ? 'motion-safe:animate-pulse' : ''}`}>
            {post.repostedFrom && (
                <div className="text-xs text-gray-400 flex items-center space-x-2">
                    <RepeatIcon className="h-4 w-4" />
                    <span>Reposted by <button onClick={() => onViewProfile(post.authorId)} className="font-semibold hover:underline">{post.authorName === currentUser.name ? "You" : post.authorName}</button></span>
                </div>
            )}

            {style.title && post.type !== 'distress' && (
                <div className="flex items-center space-x-2 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                    {style.icon}
                    <span>{style.title}</span>
                </div>
            )}

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
                            {isOwnPost && !post.repostedFrom && (
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
            {post.content && <p className="text-gray-200 whitespace-pre-wrap">{post.content}</p>}

            {/* Reposted Content */}
            {post.repostedFrom && (
                <div className="border border-slate-700 rounded-lg p-3 space-y-2 mt-2">
                    <div className="flex items-center space-x-2">
                        <UserCircleIcon className="h-8 w-8 text-gray-400" />
                        <div>
                            <button onClick={() => onViewProfile(post.repostedFrom.authorId)} className="font-semibold text-white text-sm hover:underline">{post.repostedFrom.authorName}</button>
                            <p className="text-xs text-gray-500">{post.repostedFrom.authorCircle} &bull; {formatTimeAgo(post.repostedFrom.date)}</p>
                        </div>
                    </div>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap">{post.repostedFrom.content}</p>
                </div>
            )}

            {/* Footer */}
            <div className="flex justify-between items-center pt-3 border-t border-slate-700">
                <div className="flex items-center space-x-4">
                    <button 
                        onClick={() => onUpvote(post.id)} 
                        className={`flex items-center space-x-2 transition-colors ${hasUpvoted ? 'text-green-400' : 'text-gray-400 hover:text-green-400'}`}
                    >
                        <ThumbsUpIcon className={`h-5 w-5 ${hasUpvoted ? 'fill-current' : ''}`} />
                        <span className="text-sm font-medium">{post.upvotes.length > 0 ? post.upvotes.length : ''}</span>
                    </button>
                    {!isDistressPost && (
                        <button onClick={() => onRepost(post)} className="flex items-center space-x-2 text-gray-400 hover:text-green-400">
                            <RepeatIcon className="h-5 w-5" />
                            <span className="text-sm font-medium">{post.repostCount && post.repostCount > 0 ? post.repostCount : ''}</span>
                        </button>
                    )}
                     {!isDistressPost && (
                        <button onClick={() => onShare(post)} className="flex items-center space-x-2 text-gray-400 hover:text-green-400">
                            <ShareIcon className="h-5 w-5" />
                        </button>
                    )}
                </div>

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
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [postToEdit, setPostToEdit] = useState<Post | null>(null);
  const [postToReport, setPostToReport] = useState<Post | null>(null);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);
  const [postToRepost, setPostToRepost] = useState<Post | null>(null);

  const { addToast } = useToast();

  useEffect(() => {
    setIsLoading(true);
    let unsubPosts: () => void;
    let unsubActivities: (() => void) | null = null;

    if (authorId) {
        unsubPosts = api.listenForPostsByAuthor(authorId, (fetchedPosts) => {
            setPosts(fetchedPosts);
            setIsLoading(false);
        });
        setActivities([]);
    } else {
        // FIX: Explicitly cast 'filter' to its defined union type. This resolves a TypeScript error likely caused by a project configuration issue where 'filter' is incorrectly inferred as a generic 'string'.
        unsubPosts = api.listenForPosts(filter as Post['type'] | 'all', (fetchedPosts) => {
            setPosts(fetchedPosts);
            setIsLoading(false);
        });

        if (filter === 'all') {
            unsubActivities = api.listenForActivity((fetchedActivities) => {
                setActivities(fetchedActivities);
                setIsLoading(false);
            });
        } else {
            setActivities([]);
        }
    }

    return () => {
        unsubPosts();
        if (unsubActivities) {
            unsubActivities();
        }
    };
  }, [filter, authorId]);

  const feedItems = useMemo(() => {
    const typedPosts = posts.map(p => ({ ...p, itemType: 'post' as const, sortDate: new Date(p.date) }));
    const typedActivities = activities.map(a => ({ ...a, itemType: 'activity' as const, sortDate: a.timestamp.toDate() }));
    
    const allItems = [...typedPosts, ...typedActivities];
    
    allItems.sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());

    return allItems;
  }, [posts, activities]);


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

  const handleShare = async (post: Post) => {
      const postUrl = window.location.href; // Simplified URL
      const postText = post.repostedFrom ? 
        `${post.content}\n\nReposting from ${post.repostedFrom.authorName}:\n"${post.repostedFrom.content}"` :
        post.content;
      
      const shareData = {
          title: `Post by ${post.authorName} on Ubuntium`,
          text: postText,
          url: postUrl,
      };

      if (navigator.share) {
          try {
              await navigator.share(shareData);
          } catch (err) {
              console.error('Share failed:', err);
          }
      } else {
          // Fallback for desktop browsers
          try {
              await navigator.clipboard.writeText(`${postText}\n\nView on Ubuntium: ${postUrl}`);
              addToast('Post content copied to clipboard!', 'info');
          } catch (err) {
              addToast('Could not copy to clipboard.', 'error');
          }
      }
  };

  const handleRepostSubmit = async (originalPost: Post, comment: string) => {
    try {
        await api.repostPost(originalPost, user, comment);
        addToast("Post reposted successfully!", "success");
        setPostToRepost(null);
    } catch (error) {
        addToast("Failed to repost.", "error");
        console.error(error);
    }
  };

  return (
    <div className="space-y-4">
      {isLoading ? (
        <p className="text-center text-gray-400 py-12">Loading feed...</p>
      ) : feedItems.length > 0 ? (
        <div className="space-y-4">
          {feedItems.map(item =>
            item.itemType === 'post' ? (
                <PostItem 
                    key={`${item.itemType}-${item.id}`} 
                    post={item} 
                    currentUser={user} 
                    onUpvote={handleUpvote} 
                    onDelete={setPostToDelete} 
                    onEdit={setPostToEdit} 
                    onReport={setPostToReport} 
                    isAdminView={isAdminView} 
                    onViewProfile={onViewProfile} 
                    onRepost={setPostToRepost} 
                    onShare={handleShare} 
                />
            ) : (
                <ActivityItem 
                    key={`${item.itemType}-${item.id}`} 
                    activity={item} 
                    onViewProfile={onViewProfile} 
                />
            )
          )}
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
      
      {postToRepost && (
        <RepostModal
            isOpen={!!postToRepost}
            onClose={() => setPostToRepost(null)}
            post={postToRepost}
            currentUser={user}
            onRepost={handleRepostSubmit}
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
