import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Post, User, Comment, Activity } from '../types';
import { api } from '../services/apiService';
import { useToast } from '../contexts/ToastContext';
// FIX: Import LinkifyPart type to use with the updated linkify function.
import { formatTimeAgo, linkify, LinkifyPart } from '../utils';
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
import { LightbulbIcon } from './icons/LightbulbIcon';
import { BriefcaseIcon } from './icons/BriefcaseIcon';
import { UsersIcon } from './icons/UsersIcon';
import { MessageCircleIcon } from './icons/MessageCircleIcon';
import { SendIcon } from './icons/SendIcon';
import { Timestamp, DocumentSnapshot, DocumentData } from 'firebase/firestore';
import { PinIcon } from './icons/PinIcon';
import { LoaderIcon } from './icons/LoaderIcon';
import { ActivityItem } from './ActivityItem';

const postTypeTooltips: Record<string, string> = {
    proposal: "This is a proposal for a new idea, project, or policy for the commons.",
    offer: "This is an offer of a skill, service, or resource to other members.",
    opportunity: "This is a job opening, collaboration request, or other opportunity.",
};

// --- Comment Section Components ---

const CommentItem: React.FC<{
    comment: Comment;
    postId: string;
    currentUser: User;
    onDelete: (postId: string, commentId: string) => void;
    onUpvote: (postId: string, commentId: string) => void;
    onViewProfile: (userId: string) => void;
}> = ({ comment, postId, currentUser, onDelete, onUpvote, onViewProfile }) => {
    const isOwnComment = currentUser.id === comment.authorId;
    const hasUpvoted = comment.upvotes.includes(currentUser.id);

    return (
        <div className="flex items-start space-x-3 py-3">
            <button onClick={() => onViewProfile(comment.authorId)}>
                <UserCircleIcon className="h-8 w-8 text-gray-400"/>
            </button>
            <div className="flex-1">
                <div className="bg-slate-700/50 rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                         <button onClick={() => onViewProfile(comment.authorId)} className="font-semibold text-sm text-white hover:underline">{comment.authorName}</button>
                        <p className="text-xs text-gray-500">{formatTimeAgo(comment.timestamp.toDate().toISOString())}</p>
                    </div>
                    {/* FIX: Map over the array returned by linkify to render text and links correctly. */}
                    <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{
                        linkify(comment.content).map((part, index) =>
                            part.type === 'link' ? (
                                <a
                                    key={`comment-link-${comment.id}-${index}`}
                                    href={part.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-400 hover:text-green-300 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {part.content}
                                </a>
                            ) : (
                                part.content
                            )
                        )
                    }</p>
                </div>
                <div className="flex items-center space-x-3 mt-1 pl-2">
                    <button onClick={() => onUpvote(postId, comment.id)} className={`flex items-center space-x-1 text-xs ${hasUpvoted ? 'text-green-400' : 'text-gray-400 hover:text-green-400'}`}>
                        <ThumbsUpIcon className="h-3 w-3" />
                        <span>{comment.upvotes.length > 0 ? comment.upvotes.length : 'Like'}</span>
                    </button>
                    {isOwnComment && (
                         <button onClick={() => onDelete(postId, comment.id)} className="text-xs text-gray-400 hover:text-red-400">Delete</button>
                    )}
                </div>
            </div>
        </div>
    );
};


const CommentSection: React.FC<{
    postId: string;
    currentUser: User;
    onViewProfile: (userId: string) => void;
}> = ({ postId, currentUser, onViewProfile }) => {
    const [comments, setComments] = useState<Comment[]>([]);
    const [newComment, setNewComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const unsubscribe = api.listenForComments(postId, setComments);
        return () => unsubscribe();
    }, [postId]);

    const handleCommentSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim()) return;
        setIsSubmitting(true);
        const commentData: Omit<Comment, 'id' | 'timestamp'> = {
            postId,
            authorId: currentUser.id,
            authorName: currentUser.name,
            content: newComment,
            upvotes: [],
        };
        try {
            await api.addComment(postId, commentData);
            setNewComment('');
        } catch (error) {
            console.error("Failed to post comment:", error);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteComment = async (postId: string, commentId: string) => {
        if(window.confirm("Are you sure you want to delete this comment?")) {
            await api.deleteComment(postId, commentId);
        }
    };
    
    const handleUpvoteComment = async (postId: string, commentId: string) => {
        await api.upvoteComment(postId, commentId, currentUser.id);
    };

    return (
        <div className="pt-2">
            <div className="border-t border-slate-700/50 mt-2 pt-2">
                {comments.map(comment => (
                    <CommentItem key={comment.id} comment={comment} postId={postId} currentUser={currentUser} onDelete={handleDeleteComment} onUpvote={handleUpvoteComment} onViewProfile={onViewProfile} />
                ))}
            </div>
            <form onSubmit={handleCommentSubmit} className="flex items-center space-x-2 pt-2">
                <UserCircleIcon className="h-8 w-8 text-gray-400"/>
                <input 
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment..."
                    className="flex-1 bg-slate-700 rounded-full py-2 px-4 text-white border border-slate-600 focus:outline-none focus:ring-1 focus:ring-green-500 text-sm"
                />
                <button type="submit" disabled={isSubmitting || !newComment.trim()} className="p-2 rounded-full text-white bg-green-600 hover:bg-green-700 disabled:bg-slate-600">
                    <SendIcon className="h-5 w-5"/>
                </button>
            </form>
        </div>
    );
};

// --- Post Item Component ---

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
    onFollowToggle: (targetUserId: string, targetUserName: string) => void;
    onTogglePin: (post: Post) => void;
    isAdminView?: boolean;
}> = 
({ post, currentUser, onUpvote, onDelete, onEdit, onReport, onViewProfile, onRepost, onShare, onFollowToggle, onTogglePin, isAdminView }) => {
    const isOwnPost = post.authorId === currentUser.id;
    const hasUpvoted = post.upvotes.includes(currentUser.id);
    const isFollowing = currentUser.following?.includes(post.authorId);
    const isDistressPost = post.types === 'distress';
    const [showComments, setShowComments] = useState(false);
  
    const typeStyles: Record<string, { icon: React.ReactNode; borderColor: string; title: string }> = {
        proposal: {
          icon: <LightbulbIcon className="h-4 w-4 text-blue-300" />,
          borderColor: 'border-blue-500/50',
          title: 'Proposal',
        },
        offer: {
          icon: <UsersIcon className="h-4 w-4 text-purple-300" />,
          borderColor: 'border-purple-500/50',
          title: 'Offer',
        },
        opportunity: {
          icon: <BriefcaseIcon className="h-4 w-4 text-yellow-300" />,
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

    const style = typeStyles[post.types] || typeStyles.general;

    return (
        <div className={`bg-slate-800 p-4 rounded-lg shadow-md space-y-3 border-l-4 ${style.borderColor} ${isDistressPost ? 'motion-safe:animate-pulse' : ''}`}>
            {post.isPinned && (
                <div className="flex items-center space-x-2 text-xs text-yellow-400 font-semibold mb-2 pb-2 border-b border-slate-700/50">
                    <PinIcon className="h-4 w-4 fill-current" />
                    <span>Pinned Post</span>
                </div>
            )}
            {post.repostedFrom && (
                <div className="text-xs text-gray-400 flex items-center space-x-2">
                    <RepeatIcon className="h-4 w-4" />
                    <span>Reposted by <button onClick={() => onViewProfile(post.authorId)} className="font-semibold hover:underline">{post.authorName === currentUser.name ? "You" : post.authorName}</button></span>
                </div>
            )}

            {style.title && post.types !== 'distress' && (
                <div className="relative group self-start">
                    <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider bg-slate-700/50 text-gray-300 px-2.5 py-1 rounded-full">
                        {style.icon}
                        <span>{style.title}</span>
                    </div>
                    {postTypeTooltips[post.types] && (
                        <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg border border-slate-700 z-10">
                            {postTypeTooltips[post.types]}
                        </div>
                    )}
                </div>
            )}

            {/* Header */}
            <div className="flex items-start space-x-3">
                 {isDistressPost ? 
                    <SirenIcon className="h-10 w-10 text-red-500 flex-shrink-0" />
                    :
                    <button onClick={() => post.authorId && onViewProfile(post.authorId)} className="flex-shrink-0" aria-label={`View ${post.authorName}'s profile`}>
                       <UserCircleIcon className="h-10 w-10 text-gray-400" />
                    </button>
                 }
                <div className="flex-1">
                    <div className="flex items-center space-x-2">
                        <button 
                            onClick={() => post.authorId && !isDistressPost && onViewProfile(post.authorId)} 
                            className={`font-semibold text-white ${!isDistressPost ? 'hover:underline' : 'cursor-default'} text-left`}
                            disabled={isDistressPost}
                            aria-label={`View ${post.authorName}'s profile`}
                        >
                            {post.authorName}
                        </button>
                         {!isOwnPost && !isDistressPost && (
                            <>
                                <span className="text-gray-500 text-xs">&bull;</span>
                                <button
                                    onClick={() => onFollowToggle(post.authorId, post.authorName)}
                                    className={`text-xs font-semibold transition-colors ${isFollowing ? 'text-gray-400' : 'text-green-400 hover:text-green-300'}`}
                                >
                                    {isFollowing ? 'Following' : 'Follow'}
                                </button>
                            </>
                        )}
                    </div>
                    <p className="text-xs text-gray-500">{post.authorCircle} &bull; {formatTimeAgo(post.date)}</p>
                </div>
                <div className="ml-auto flex items-center space-x-3 text-gray-500">
                    {isAdminView && !isDistressPost && (
                        <button onClick={() => onTogglePin(post)} className="hover:text-yellow-400" title={post.isPinned ? "Unpin post" : "Pin post"}>
                            <PinIcon className={`h-4 w-4 ${post.isPinned ? 'fill-current text-yellow-400' : ''}`} />
                        </button>
                    )}
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
            {post.content && <p className="text-gray-200 whitespace-pre-wrap break-words">{
                linkify(post.content).map((part, index) =>
                    part.type === 'link' ? (
                        <a
                            key={`post-link-${post.id}-${index}`}
                            href={part.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-green-400 hover:text-green-300 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {part.content}
                        </a>
                    ) : (
                        part.content
                    )
                )
            }</p>}

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
                    <p className="text-gray-300 text-sm whitespace-pre-wrap break-words">{
                        linkify(post.repostedFrom.content).map((part, index) =>
                            part.type === 'link' ? (
                                <a
                                    key={`repost-link-${post.repostedFrom?.postId}-${index}`}
                                    href={part.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-green-400 hover:text-green-300 hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    {part.content}
                                </a>
                            ) : (
                                part.content
                            )
                        )
                    }</p>
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
                     <button 
                        onClick={() => setShowComments(prev => !prev)} 
                        className="flex items-center space-x-2 text-gray-400 hover:text-green-400"
                    >
                        <MessageCircleIcon className="h-5 w-5" />
                        <span className="text-sm font-medium">{post.commentCount && post.commentCount > 0 ? post.commentCount : ''}</span>
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
            {showComments && <CommentSection postId={post.id} currentUser={currentUser} onViewProfile={onViewProfile} />}
        </div>
    );
};

// --- Main Feed Component ---

interface PostsFeedProps {
  user: User;
  feedType?: 'all' | 'following';
  typeFilter?: Post['types'] | 'all';
  authorId?: string;
  isAdminView?: boolean;
  onViewProfile: (userId: string) => void;
}

const POSTS_PER_PAGE = 10;

export const PostsFeed: React.FC<PostsFeedProps> = ({ user, feedType = 'all', typeFilter = 'all', authorId, isAdminView = false, onViewProfile }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const [postToEdit, setPostToEdit] = useState<Post | null>(null);
  const [postToReport, setPostToReport] = useState<Post | null>(null);
  const [postToDelete, setPostToDelete] = useState<Post | null>(null);
  const [postToRepost, setPostToRepost] = useState<Post | null>(null);

  const { addToast } = useToast();

  const fetchInitialPosts = useCallback(async () => {
    setIsLoading(true);
    setHasMore(true);
    setPosts([]);
    try {
        // FIX: Add type assertion to `typeFilter` to prevent type errors when a parent component passes a generic string.
        const [pinnedPostsResult, { posts: regularPosts, lastVisible: newLastVisible }] = await Promise.all([
            api.fetchPinnedPosts(isAdminView),
            api.fetchRegularPosts(POSTS_PER_PAGE, typeFilter as Post['types'] | 'all', isAdminView)
        ]);
        
        let pinnedPosts = pinnedPostsResult;
        if (typeFilter !== 'all') {
            pinnedPosts = pinnedPosts.filter(p => p.types === typeFilter);
        }

        const all = [...pinnedPosts, ...regularPosts];
        const uniquePosts = Array.from(new Map(all.map(p => [p.id, p])).values());

        setPosts(uniquePosts);
        setLastVisible(newLastVisible);
        if (regularPosts.length < POSTS_PER_PAGE || newLastVisible === null) {
            setHasMore(false);
        }
    } catch (error) {
        addToast("Could not load feed. Please check your permissions.", "error");
        console.error("Feed loading error:", error);
    } finally {
        setIsLoading(false);
    }
  }, [addToast, typeFilter, isAdminView]);

  const fetchMorePosts = useCallback(async () => {
    if (!hasMore || isLoadingMore || !lastVisible) return;
    setIsLoadingMore(true);
    try {
      // FIX: Add type assertion to `typeFilter` to prevent type errors when a parent component passes a generic string.
      const { posts: newPosts, lastVisible: newLastVisible } = await api.fetchRegularPosts(POSTS_PER_PAGE, typeFilter as Post['types'] | 'all', isAdminView, lastVisible);
      
      const existingIds = new Set(posts.map(p => p.id));
      const uniqueNewPosts = newPosts.filter(p => !existingIds.has(p.id));

      setPosts(prev => [...prev, ...uniqueNewPosts]);
      setLastVisible(newLastVisible);
      if (newPosts.length < POSTS_PER_PAGE || newLastVisible === null) {
        setHasMore(false);
      }
    } catch (error) {
      addToast("Could not load more posts.", "error");
      console.error("Feed loading more error:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [addToast, hasMore, isLoadingMore, lastVisible, posts, typeFilter, isAdminView]);

  useEffect(() => {
    const onError = (error: Error) => {
        addToast("Could not load feed. You may not have the required permissions.", "error");
        console.error("Feed loading error:", error);
        setIsLoading(false);
    }

    let unsubActivities = () => {};

    if (authorId) {
        setIsLoading(true);
        const unsub = api.listenForPostsByAuthor(authorId, (fetchedPosts) => {
            const filtered = typeFilter === 'all' ? fetchedPosts : fetchedPosts.filter(p => p.types === typeFilter);
            setPosts(filtered);
            setIsLoading(false);
            setHasMore(false);
        }, onError);
        return unsub;
    } else if (feedType === 'following') {
        setIsLoading(true);
        const unsub = api.listenForFollowingPosts(user.following || [], (fetchedPosts) => {
            const filtered = typeFilter === 'all' ? fetchedPosts : fetchedPosts.filter(p => p.types === typeFilter);
            setPosts(filtered);
            setIsLoading(false);
            setHasMore(false);
        }, onError);
        return unsub;
    }
    else { // 'all' feed with pagination
        fetchInitialPosts();
        unsubActivities = api.listenForAllNewMemberActivity((acts) => {
            setActivities(acts);
        }, onError);
    }
    
    return () => { unsubActivities(); };
  }, [feedType, authorId, user.following, addToast, fetchInitialPosts, typeFilter]);
  
  const mergedAndSortedItems = useMemo(() => {
    const typedPosts = posts.map(p => ({ ...p, itemType: 'post' as const, sortDate: new Date(p.date) }));
    const typedActivities = feedType === 'all' ? activities.map(a => ({ ...a, itemType: 'activity' as const, sortDate: a.timestamp.toDate() })) : [];
    
    const allItems: (typeof typedPosts[0] | typeof typedActivities[0])[] = [...typedPosts, ...typedActivities];

    allItems.sort((a, b) => {
        const aIsPinned = (a.itemType === 'post' && a.isPinned) ?? false;
        const bIsPinned = (b.itemType === 'post' && b.isPinned) ?? false;
        
        if (aIsPinned && !bIsPinned) return -1;
        if (!aIsPinned && bIsPinned) return 1;
        
        return b.sortDate.getTime() - a.sortDate.getTime();
    });

    const uniqueItems = Array.from(new Map(allItems.map(item => [`${item.itemType}-${item.id}`, item])).values());
    
    return uniqueItems;
  }, [posts, activities, feedType]);

  const handleUpvote = async (postId: string) => {
    try {
      // The API call will update the database.
      await api.upvotePost(postId, user.id);
      
      // Since the 'all' feed is not real-time (it uses pagination), we need to
      // manually update the local state to provide instant visual feedback.
      // For real-time feeds (like 'following'), the listener will handle this automatically,
      // but running it here too ensures a snappy UI response for all cases.
      setPosts(prevPosts =>
        prevPosts.map(p => {
          if (p.id === postId) {
            const hasUpvoted = p.upvotes.includes(user.id);
            // The API call toggled the state, so we mimic that toggle here.
            const newUpvotes = hasUpvoted
              ? p.upvotes.filter(uid => uid !== user.id)
              : [...p.upvotes, user.id];
            return { ...p, upvotes: newUpvotes };
          }
          return p;
        })
      );
    } catch (error) {
      addToast("Could not process like.", "error");
    }
  };
  
  const handleConfirmDelete = async () => {
    if (!postToDelete) return;
    const postToDeleteId = postToDelete.id;
    try {
        if (postToDelete.types === 'distress') {
            await api.deleteDistressPost(user, postToDelete.id, postToDelete.authorId);
        } else {
            await api.deletePost(postToDelete.id);
        }
        setPosts(prev => prev.filter(p => p.id !== postToDeleteId));
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
        setPosts(prev => prev.map(p => p.id === postId ? { ...p, content } : p));
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
        // Refresh feed to show repost
        if(feedType === 'all') fetchInitialPosts();
    } catch (error) {
        addToast("Failed to repost.", "error");
        console.error(error);
    }
  };
  
  const handleFollowToggle = async (targetUserId: string, targetUserName: string) => {
    if (!user) return;
    const isCurrentlyFollowing = user.following?.includes(targetUserId);

    if (user.id === targetUserId) return;

    try {
      if (isCurrentlyFollowing) {
        await api.unfollowUser(user.id, targetUserId);
        addToast(`Unfollowed ${targetUserName}`, 'info');
      } else {
        await api.followUser(user.id, targetUserId);
        addToast(`You are now following ${targetUserName}`, 'success');
      }
    } catch (error) {
      addToast('Action failed. Please try again.', 'error');
    }
  };

  const handleTogglePin = async (post: Post) => {
    if (user.role !== 'admin') return;
    try {
      await api.togglePinPost(user, post.id, !post.isPinned);
      setPosts(prev => prev.map(p => p.id === post.id ? { ...p, isPinned: !post.isPinned } : p));
      addToast(post.isPinned ? "Post unpinned." : "Post pinned to top.", "success");
    } catch (error) {
      addToast("Failed to update pin status.", "error");
    }
  };


  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex justify-center items-center py-12">
            <LoaderIcon className="h-8 w-8 animate-spin text-green-500" />
        </div>
      ) : mergedAndSortedItems.length > 0 ? (
        <>
            <div className="space-y-4">
            {mergedAndSortedItems.map(item => (
                item.itemType === 'post' ? (
                <PostItem 
                    key={`post-${item.id}`} 
                    post={item as Post} 
                    currentUser={user} 
                    onUpvote={handleUpvote} 
                    onDelete={setPostToDelete} 
                    onEdit={setPostToEdit} 
                    onReport={setPostToReport} 
                    isAdminView={isAdminView} 
                    onViewProfile={onViewProfile} 
                    onRepost={setPostToRepost} 
                    onShare={handleShare}
                    onFollowToggle={handleFollowToggle}
                    onTogglePin={handleTogglePin}
                />
              ) : (
                <ActivityItem 
                    key={`activity-${item.id}`}
                    activity={item as Activity}
                    onViewProfile={onViewProfile}
                />
              )
            ))}
            </div>
            {feedType === 'all' && !authorId && hasMore && (
                <div className="text-center mt-6">
                    <button 
                        onClick={fetchMorePosts}
                        disabled={isLoadingMore}
                        className="inline-flex items-center justify-center px-4 py-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-green-500 font-semibold disabled:bg-slate-800 disabled:cursor-not-allowed"
                    >
                        {isLoadingMore ? (
                            <>
                                <LoaderIcon className="h-5 w-5 mr-2 animate-spin" />
                                Loading...
                            </>
                        ) : 'Load More'}
                    </button>
                </div>
            )}
        </>
      ) : (
        <div className="text-center text-gray-500 py-12 bg-slate-800 rounded-lg">
            {authorId ? "This user hasn't made any posts yet." : 
             feedType === 'following' ? "Your 'Following' feed is empty. Follow some members to see their posts here." :
             "It's quiet in here... be the first to post!"}
        </div>
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