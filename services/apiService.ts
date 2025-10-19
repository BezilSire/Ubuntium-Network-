import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  User as FirebaseUser,
  sendEmailVerification,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  Timestamp,
  orderBy,
  limit,
  updateDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  deleteDoc,
  writeBatch,
  increment,
  serverTimestamp as firestoreServerTimestamp,
  documentId
} from 'firebase/firestore';
import { ref, onValue, onDisconnect, set, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { auth, db, rtdb } from './firebase';
import { 
    User, Agent, Member, NewMember, Broadcast, Post, NewPublicMemberData, MemberUser, 
    Conversation, Message, Report, UserReport, Notification, Activity, Comment
} from '../types';
import { generateAgentCode } from '../utils';
import { generateWelcomeMessage } from './geminiService';


const usersCollection = collection(db, 'users');
const membersCollection = collection(db, 'members');
const broadcastsCollection = collection(db, 'broadcasts');
const postsCollection = collection(db, 'posts');
const conversationsCollection = collection(db, 'conversations');
const reportsCollection = collection(db, 'reports');
const userReportsCollection = collection(db, 'user_reports');
const notificationsCollection = collection(db, 'notifications');
const activityFeedCollection = collection(db, 'activity_feed');

const getUserProfile = async (uid: string): Promise<User | null> => {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
        return { id: userDoc.id, ...userDoc.data() } as User;
    }
    return null;
};

export const api = {
  // Auth
  login: async (email: string, password: string): Promise<User | null> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const userProfile = await getUserProfile(userCredential.user.uid);
    if (userProfile?.status === 'ousted') {
        await signOut(auth);
        throw new Error("This account has been suspended.");
    }
    return userProfile;
  },

  logout: async (): Promise<void> => {
    await signOut(auth);
  },
  
  signup: async (name: string, email: string, password: string, circle: string): Promise<Agent> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const { user } = userCredential;

    const newAgent: Agent = {
      id: user.uid,
      name,
      email,
      role: 'agent',
      circle,
      agent_code: generateAgentCode(),
      status: 'active',
      credibility_score: 100,
      following: [],
      followers: [],
    };
    await setDoc(doc(usersCollection, user.uid), newAgent);
    return newAgent;
  },

  memberSignup: async (memberData: NewPublicMemberData, password: string): Promise<MemberUser> => {
    const userCredential = await createUserWithEmailAndPassword(auth, memberData.email, password);
    const permanentUser = userCredential.user;

    try {
        const newMemberDoc: Omit<Member, 'id'> = {
            full_name: memberData.full_name,
            phone: memberData.phone,
            email: memberData.email,
            circle: memberData.circle,
            address: memberData.address,
            national_id: memberData.national_id,
            registration_amount: 0,
            payment_status: 'pending_verification',
            agent_id: 'PUBLIC_SIGNUP',
            date_registered: new Date().toISOString(),
            membership_card_id: 'PENDING',
            welcome_message: 'Your registration is under review. Welcome to the community!',
            uid: permanentUser.uid,
        };
        const memberRef = await addDoc(membersCollection, newMemberDoc);

        const newUserProfile: MemberUser = {
            id: permanentUser.uid,
            name: memberData.full_name,
            email: memberData.email,
            role: 'member',
            member_id: memberRef.id,
            distress_calls_available: 0,
            status: 'pending',
            circle: memberData.circle,
            credibility_score: 100,
            phone: memberData.phone,
            address: memberData.address,
            id_card_number: memberData.national_id,
            following: [],
            followers: [],
        };
        await setDoc(doc(usersCollection, permanentUser.uid), newUserProfile);
        return newUserProfile;
    } catch (dbError) {
        console.error("DB write failed after user creation:", dbError);
        throw new Error("Account created, but failed to save profile. Please contact support.");
    }
  },
   
  sendPasswordReset: (email: string): Promise<void> => {
      return sendPasswordResetEmail(auth, email);
  },

  sendVerificationEmail: async (): Promise<void> => {
    const user = auth.currentUser;
    if (user) {
      await sendEmailVerification(user);
    } else {
      throw new Error("No user is currently signed in to send a verification email.");
    }
  },

  // User/Profile Management
  getUserProfile, 

  getSearchableUsers: async (): Promise<User[]> => {
      const currentUser = auth.currentUser;
      if (!currentUser) return [];
      const userProfile = await getUserProfile(currentUser.uid);
      if (userProfile?.role !== 'admin') {
          return []; // Non-admins cannot search all users
      }
      
      const q = query(usersCollection, where("status", "==", "active"));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
  },
  
  getNewMembersInCircle: async (circle: string, currentUserId: string): Promise<User[]> => {
    const q = query(
        activityFeedCollection,
        where("type", "==", "NEW_MEMBER"),
        where("causerCircle", "==", circle),
        orderBy("timestamp", "desc"),
        limit(20) // Get more activities to account for duplicates
    );
    const activitySnap = await getDocs(q);
    
    // Get unique user IDs, excluding the current user
    const userIds = activitySnap.docs
        .map(doc => doc.data().causerId as string)
        .filter(id => id !== currentUserId);
    
    const uniqueUserIds = [...new Set(userIds)].slice(0, 10);

    if (uniqueUserIds.length === 0) {
        return [];
    }
    
    // Firestore 'in' queries can handle up to 30 items, so a single query is fine.
    const usersQuery = query(usersCollection, where(documentId(), 'in', uniqueUserIds));
    const usersSnap = await getDocs(usersQuery);
    
    const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    
    // The query result order isn't guaranteed, so we'll sort based on the original activity order.
    return users.sort((a, b) => uniqueUserIds.indexOf(a.id) - uniqueUserIds.indexOf(b.id));
  },

  getMembersInSameCircle: async (circle: string, currentUserId: string): Promise<User[]> => {
    const q = query(
        postsCollection,
        where("authorCircle", "==", circle),
        where("type", "!=", "distress"),
        orderBy("date", "desc"),
        limit(50) // Look at the last 50 posts in the circle
    );
    const postsSnap = await getDocs(q);
    
    const authorIds = postsSnap.docs
        .map(doc => doc.data().authorId as string)
        .filter(id => id !== currentUserId);
    
    const uniqueAuthorIds = [...new Set(authorIds)].slice(0, 12); // Get up to 12 unique authors

    if (uniqueAuthorIds.length === 0) {
        return [];
    }

    const usersQuery = query(usersCollection, where(documentId(), 'in', uniqueAuthorIds));
    const usersSnap = await getDocs(usersQuery);

    const users = usersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
    
    // Sort based on the order of appearance in the unique list
    return users.sort((a, b) => uniqueAuthorIds.indexOf(a.id) - uniqueAuthorIds.indexOf(b.id));
  },

  getMemberByUid: async(uid: string): Promise<Member | null> => {
      const q = query(membersCollection, where("uid", "==", uid), limit(1));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() } as Member;
  },

  updateUser: async (uid: string, updatedData: Partial<User>): Promise<User> => {
      const userDocRef = doc(db, 'users', uid);
      await updateDoc(userDocRef, updatedData);
      const updatedDoc = await getDoc(userDocRef);
      if (!updatedDoc.exists()) {
        throw new Error("User document not found after update.");
      }
      return { id: updatedDoc.id, ...updatedDoc.data() } as User;
  },

  updateMemberProfile: async(memberId: string, updatedData: Partial<Member>): Promise<void> => {
      const memberDocRef = doc(db, 'members', memberId);
      await updateDoc(memberDocRef, updatedData);
  },

  // Presence
  setupPresence: (uid: string) => {
    const userStatusDatabaseRef = ref(rtdb, '/status/' + uid);
    const userStatusFirestoreRef = doc(db, 'users', uid);

    const isOfflineForRTDB = { online: false, lastSeen: rtdbServerTimestamp() };
    const isOnlineForRTDB = { online: true, lastSeen: rtdbServerTimestamp() };
    
    const isOfflineForFirestore = { online: false, lastSeen: firestoreServerTimestamp() };
    const isOnlineForFirestore = { online: true, lastSeen: firestoreServerTimestamp() };

    onDisconnect(userStatusDatabaseRef).set(isOfflineForRTDB).then(() => {
        set(userStatusDatabaseRef, isOnlineForRTDB);
        updateDoc(userStatusFirestoreRef, isOnlineForFirestore);
    });
  },

  goOffline: (uid: string) => {
    const userStatusDatabaseRef = ref(rtdb, '/status/' + uid);
    const userStatusFirestoreRef = doc(db, 'users', uid);
    set(userStatusDatabaseRef, { online: false, lastSeen: rtdbServerTimestamp() });
    updateDoc(userStatusFirestoreRef, { online: false, lastSeen: firestoreServerTimestamp() });
  },

  listenForUsersPresence: (uids: string[], callback: (statuses: Record<string, boolean>) => void): (() => void) => {
    const unsubscribers = uids.map(uid => {
      const userStatusRef = ref(rtdb, '/status/' + uid);
      return onValue(userStatusRef, (snapshot) => {
        const status = snapshot.val();
        callback({ [uid]: status?.online || false });
      });
    });

    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  },

  // Agent actions
  registerMember: async (agent: Agent, memberData: NewMember): Promise<Member> => {
    let welcome_message = `Welcome to the Ubuntium Global Commons, ${memberData.full_name}! We are thrilled to have you join the ${agent.circle} Circle. I am because we are.`;
    let needs_welcome_update = false;

    try {
      welcome_message = await generateWelcomeMessage(memberData.full_name, agent.circle);
    } catch (error) {
      console.warn("Could not generate welcome message (likely offline). Using default and flagging for update.", error);
      needs_welcome_update = true;
    }

    const newMember: Omit<Member, 'id'> = {
      ...memberData,
      agent_id: agent.id,
      agent_name: agent.name,
      date_registered: new Date().toISOString(),
      membership_card_id: `UGC-M-${Date.now()}`,
      welcome_message,
      uid: null,
      ...(needs_welcome_update && { needs_welcome_update: true })
    };

    const docRef = await addDoc(membersCollection, newMember);
    return { ...newMember, id: docRef.id };
  },

  getAgentMembers: async (agentId: string): Promise<Member[]> => {
    const q = query(membersCollection, where("agent_id", "==", agentId));
    const querySnapshot = await getDocs(q);
    const members = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
    members.sort((a, b) => new Date(b.date_registered).getTime() - new Date(a.date_registered).getTime());
    return members;
  },
  
  // Admin actions
  listenForAllUsers: (callback: (users: User[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(usersCollection, orderBy("name", "asc"));
      return onSnapshot(q,
        (snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
            callback(users);
        },
        (error) => {
            console.error("Firestore listener error (all users):", error);
            onError(error);
        }
      );
  },
  
  updateUserRole: async (uid: string, newRole: User['role']): Promise<void> => {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, { role: newRole });
  },

  listenForAllMembers: (callback: (members: Member[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(membersCollection, orderBy("date_registered", "desc"));
      return onSnapshot(q,
        (snapshot) => {
            const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
            const emailCounts = members.reduce((acc, member) => {
                acc[member.email] = (acc[member.email] || 0) + 1;
                return acc;
            }, {} as {[key:string]: number});
            const membersWithDuplicates = members.map(member => ({ ...member, is_duplicate_email: emailCounts[member.email] > 1 }));
            callback(membersWithDuplicates);
        },
        (error) => {
            console.error("Firestore listener error (all members):", error);
            onError(error);
        }
      );
  },
  
  listenForPendingMembers: (callback: (members: Member[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(membersCollection, where("payment_status", "==", "pending_verification"));
      return onSnapshot(q, 
        (snapshot) => {
            const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
            members.sort((a, b) => new Date(a.date_registered).getTime() - new Date(b.date_registered).getTime());
            callback(members);
        },
        (error) => {
            console.error("Firestore listener error (pending members):", error);
            onError(error);
        }
      );
  },

  listenForAllAgents: (callback: (agents: Agent[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(usersCollection, where("role", "==", "agent"));
      return onSnapshot(q, 
        (snapshot) => {
            const agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent));
            callback(agents);
        },
        (error) => {
            console.error("Firestore listener error (all agents):", error);
            onError(error);
        }
      );
  },

  approveMember: async (member: Member): Promise<void> => {
      if (!member.uid) throw new Error("Member does not have a user account to approve.");
      
      const welcome_message = await generateWelcomeMessage(member.full_name, member.circle);
      const batch = writeBatch(db);

      const memberRef = doc(db, 'members', member.id);
      batch.update(memberRef, { 
          payment_status: 'complete', 
          welcome_message,
          membership_card_id: `UGC-M-${Date.now()}`
      });

      const userRef = doc(db, 'users', member.uid);
      batch.update(userRef, { status: 'active', distress_calls_available: 2 });
      
      await batch.commit();
  },

  rejectMember: async (member: Member): Promise<void> => {
      const batch = writeBatch(db);
      const memberRef = doc(db, 'members', member.id);
      batch.update(memberRef, { payment_status: 'rejected' });
      
      if (member.uid) {
          const userRef = doc(db, 'users', member.uid);
          batch.update(userRef, { status: 'ousted' });
      }
      await batch.commit();
  },

  sendBroadcast: async (message: string): Promise<Broadcast> => {
    const newBroadcast: Omit<Broadcast, 'id'> = {
      message,
      date: new Date().toISOString(),
    };
    const docRef = await addDoc(broadcastsCollection, newBroadcast);
    return { ...newBroadcast, id: docRef.id };
  },

  getBroadcasts: async (): Promise<Broadcast[]> => {
    const q = query(broadcastsCollection, orderBy("date", "desc"), limit(20));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Broadcast));
  },
  
  updatePaymentStatus: async (memberId: string, status: Member['payment_status']): Promise<void> => {
      const memberDocRef = doc(db, 'members', memberId);
      await updateDoc(memberDocRef, { payment_status: status });
  },
  
  resetDistressQuota: async (uid: string): Promise<void> => {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { distress_calls_available: 2 });
  },
  
  clearLastDistressPost: async (uid: string): Promise<void> => {
      const userRef = doc(db, 'users', uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as MemberUser;
      if (userData.last_distress_post_id) {
          const postRef = doc(db, 'posts', userData.last_distress_post_id);
          await deleteDoc(postRef);
          await updateDoc(userRef, { last_distress_post_id: null });
      }
  },

  processPendingWelcomeMessages: async (): Promise<number> => {
    const q = query(membersCollection, where("needs_welcome_update", "==", true), limit(10));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    let updateCount = 0;
    for (const memberDoc of snapshot.docs) {
        const member = { id: memberDoc.id, ...memberDoc.data() } as Member;
        try {
            const welcome_message = await generateWelcomeMessage(member.full_name, member.circle);
            const memberRef = doc(db, 'members', member.id);
            batch.update(memberRef, { welcome_message, needs_welcome_update: false });
            updateCount++;
        } catch (error) {
            console.error(`Failed to generate welcome message for synced member ${member.id}. Will retry later.`, error);
        }
    }
    if (updateCount > 0) await batch.commit();
    return updateCount;
  },

  // Member actions
  getMemberById: async (memberId: string): Promise<Member | null> => {
      const docRef = doc(db, 'members', memberId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
          return { id: docSnap.id, ...docSnap.data() } as Member;
      }
      return null;
  },
  
  createPost: async (author: User, content: string, type: Post['type']): Promise<Post> => {
      const newPostData: Omit<Post, 'id'> = {
          authorId: author.id,
          authorName: author.name,
          authorCircle: author.circle || 'Unknown',
          content,
          date: new Date().toISOString(),
          upvotes: [],
          commentCount: 0,
          repostCount: 0,
          type,
      };
      const postRef = await addDoc(postsCollection, newPostData);
      return { ...newPostData, id: postRef.id };
  },

  repostPost: async (originalPost: Post, author: User, comment: string): Promise<void> => {
    const batch = writeBatch(db);
    const newPostData: Omit<Post, 'id'> = {
        authorId: author.id,
        authorName: author.name,
        authorCircle: author.circle || 'Unknown',
        content: comment,
        date: new Date().toISOString(),
        upvotes: [],
        commentCount: 0,
        repostCount: 0,
        type: 'general',
        repostedFrom: {
            postId: originalPost.id,
            authorId: originalPost.authorId,
            authorName: originalPost.authorName,
            authorCircle: originalPost.authorCircle,
            content: originalPost.content,
            date: originalPost.date,
        }
    };
    const newPostRef = doc(collection(db, 'posts'));
    batch.set(newPostRef, newPostData);
    const originalPostRef = doc(db, 'posts', originalPost.id);
    batch.update(originalPostRef, { repostCount: increment(1) });
    await batch.commit();
  },

  createDistressPost: async (content: string): Promise<User> => {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");

      const userRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userRef);
      const userData = userDoc.data() as MemberUser;
      
      if (userData.distress_calls_available <= 0) {
          throw new Error("No distress calls available.");
      }
      
      const newPostData: Omit<Post, 'id'> = {
          authorId: userData.id,
          authorName: "Anonymous Member",
          authorCircle: userData.circle || 'Unknown',
          content,
          date: new Date().toISOString(),
          upvotes: [],
          commentCount: 0,
          repostCount: 0,
          type: 'distress',
      };
      const postRef = await addDoc(postsCollection, newPostData);

      await updateDoc(userRef, {
          distress_calls_available: userData.distress_calls_available - 1,
          last_distress_post_id: postRef.id
      });
      
      const updatedUser = await getUserProfile(currentUser.uid);
      if (!updatedUser) throw new Error("Could not refetch user profile.");
      return updatedUser;
  },

  listenForPosts: (filter: Post['type'] | 'all', callback: (posts: Post[]) => void): () => void => {
    let q;
    if (filter === 'all') {
        q = query(postsCollection, where('type', 'in', ['general', 'proposal', 'offer', 'opportunity']), orderBy('date', 'desc'), limit(50));
    } else {
        q = query(postsCollection, where('type', '==', filter), orderBy('date', 'desc'), limit(50));
    }
    
    return onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        callback(posts);
    }, (error) => {
        console.error(`Firestore listener error for posts (filter: ${filter}):`, error);
    });
  },

  listenForPostsByAuthor: (authorId: string, callback: (posts: Post[]) => void): () => void => {
    const q = query(postsCollection, where("authorId", "==", authorId), orderBy('date', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        callback(posts);
    });
  },

  upvotePost: async (postId: string, userId: string): Promise<void> => {
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      if (postDoc.exists()) {
          const post = postDoc.data() as Post;
          if (post.upvotes.includes(userId)) {
              await updateDoc(postRef, { upvotes: arrayRemove(userId) });
          } else {
              await updateDoc(postRef, { upvotes: arrayUnion(userId) });
          }
      }
  },

  deletePost: async (postId: string): Promise<void> => {
      const postRef = doc(db, 'posts', postId);
      await deleteDoc(postRef);
  },
  
  deleteDistressPost: async (postId: string, authorId: string): Promise<void> => {
      const batch = writeBatch(db);
      const postRef = doc(db, 'posts', postId);
      batch.delete(postRef);

      const userRef = doc(db, 'users', authorId);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
          const userData = userDoc.data() as MemberUser;
          if (userData.last_distress_post_id === postId) {
              batch.update(userRef, { last_distress_post_id: null });
          }
      }
      await batch.commit();
  },

  updatePost: async (postId: string, content: string): Promise<void> => {
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, { content });
  },

  // Comments
  listenForComments: (postId: string, callback: (comments: Comment[]) => void): () => void => {
    const commentsRef = collection(db, 'posts', postId, 'comments');
    const q = query(commentsRef, orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
        callback(comments);
    });
  },

  addComment: async (postId: string, commentData: Omit<Comment, 'id' | 'timestamp'>): Promise<void> => {
    const postRef = doc(db, 'posts', postId);
    const commentsRef = collection(postRef, 'comments');
    await addDoc(commentsRef, { ...commentData, timestamp: Timestamp.now() });
    await updateDoc(postRef, { commentCount: increment(1) });
  },

  deleteComment: async (postId: string, commentId: string): Promise<void> => {
      const commentRef = doc(db, 'posts', postId, 'comments', commentId);
      await deleteDoc(commentRef);
      const postRef = doc(db, 'posts', postId);
      await updateDoc(postRef, { commentCount: increment(-1) });
  },

  upvoteComment: async (postId: string, commentId: string, userId: string): Promise<void> => {
      const commentRef = doc(db, 'posts', postId, 'comments', commentId);
      const commentDoc = await getDoc(commentRef);
      if (commentDoc.exists()) {
          const comment = commentDoc.data() as Comment;
          if (comment.upvotes.includes(userId)) {
              await updateDoc(commentRef, { upvotes: arrayRemove(userId) });
          } else {
              await updateDoc(commentRef, { upvotes: arrayUnion(userId) });
          }
      }
  },
  
  // Following / Feed
  listenForFollowingPosts: (followingIds: string[], callback: (posts: Post[]) => void): () => void => {
    if (followingIds.length === 0) {
        callback([]);
        return () => {};
    }
    const queryIds = followingIds.slice(0, 30); // Firestore 'in' query limit is 30
    const q = query(postsCollection, where('authorId', 'in', queryIds), orderBy('date', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        callback(posts);
    }, (error) => console.error(`Firestore listener error for following posts:`, error));
  },

  followUser: async (currentUserId: string, targetUserId: string): Promise<void> => {
    const currentUserRef = doc(db, 'users', currentUserId);
    await updateDoc(currentUserRef, { following: arrayUnion(targetUserId) });
  },

  unfollowUser: async (currentUserId: string, targetUserId: string): Promise<void> => {
    const currentUserRef = doc(db, 'users', currentUserId);
    await updateDoc(currentUserRef, { following: arrayRemove(targetUserId) });
  },

  reportUser: async (reporter: User, reportedUser: User, reason: string, details: string): Promise<void> => {
    const newReport: Omit<UserReport, 'id'> = {
        reporterId: reporter.id,
        reporterName: reporter.name,
        reportedUserId: reportedUser.id,
        reportedUserName: reportedUser.name,
        reason,
        details,
        date: new Date().toISOString(),
        status: 'new',
    };
    await addDoc(userReportsCollection, newReport);
  },

  // Reporting
  reportPost: async (reporter: User, post: Post, reason: string, details: string): Promise<void> => {
    const newReport: Omit<Report, 'id'> = {
        reporterId: reporter.id,
        reporterName: reporter.name,
        postId: post.id,
        postAuthorId: post.authorId,
        postContent: post.content,
        reason,
        details,
        date: new Date().toISOString(),
        status: 'new',
    };
    await addDoc(reportsCollection, newReport);
  },

  listenForReports: (callback: (reports: Report[]) => void, onError: (error: Error) => void): () => void => {
    const q = query(reportsCollection, orderBy('date', 'desc'));
    return onSnapshot(q, 
        snapshot => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report))),
        error => onError(error)
    );
  },

  resolvePostReport: async (reportId: string, postId: string, authorId: string): Promise<void> => {
    const batch = writeBatch(db);
    const reportRef = doc(db, 'reports', reportId);
    batch.update(reportRef, { status: 'resolved' });
    const postRef = doc(db, 'posts', postId);
    batch.delete(postRef);
    
    await batch.commit();
  },
  
  dismissReport: async (reportId: string): Promise<void> => {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { status: 'resolved' });
  },

  // Chat
  getChatContacts: async (currentUser: User, forGroup: boolean = false): Promise<User[]> => {
    // Admins can see everyone, which is fine as they have permissions.
    if (currentUser.role === 'admin') {
        const q = query(usersCollection, where("status", "==", "active"));
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() } as User))
            .filter(user => user.id !== currentUser.id);
    }
    
    // For non-admins, securely fetch contacts based on their connections and admins.
    const contactIds = new Set<string>();
    
    // Add followers and following
    (currentUser.following || []).forEach(id => contactIds.add(id));
    (currentUser.followers || []).forEach(id => contactIds.add(id));
    
    contactIds.delete(currentUser.id);

    const idsToFetch = Array.from(contactIds);

    // Fetch all admins to ensure they are always contactable
    const adminsQuery = query(usersCollection, where("role", "==", "admin"));
    const adminsSnap = await getDocs(adminsQuery);
    const adminUsers = adminsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));

    // Use a secure, chunked 'in' query to fetch profiles by ID.
    const allContacts: User[] = [...adminUsers];
    const CHUNK_SIZE = 30; 
    for (let i = 0; i < idsToFetch.length; i += CHUNK_SIZE) {
        const chunk = idsToFetch.slice(i, i + CHUNK_SIZE);
        if (chunk.length > 0) {
            const contactsQuery = query(usersCollection, where(documentId(), 'in', chunk));
            const contactsSnap = await getDocs(contactsQuery);
            contactsSnap.forEach(doc => {
                const userData = doc.data() as User;
                if (userData.status === 'active') {
                     allContacts.push({ id: doc.id, ...userData });
                }
            });
        }
    }
    
    // Deduplicate and filter out self
    const uniqueUsers = Array.from(new Map(allContacts.map(item => [item.id, item])).values());
    return uniqueUsers
      .filter(user => user.id !== currentUser.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
  
  listenForConversations: (userId: string, callback: (convos: Conversation[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(conversationsCollection, where('members', 'array-contains', userId));
      return onSnapshot(q, (snapshot) => {
        const convos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
        convos.sort((a, b) => (b.lastMessageTimestamp?.toMillis() || 0) - (a.lastMessageTimestamp?.toMillis() || 0));
        callback(convos);
      }, (error) => onError(error));
  },

  listenForMessages: (convoId: string, callback: (msgs: Message[]) => void): () => void => {
      const messagesRef = collection(db, 'conversations', convoId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));
      return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message))));
  },

  sendMessage: async (convoId: string, message: Omit<Message, 'id'|'timestamp'>, conversation: Conversation): Promise<void> => {
      const messagesRef = collection(db, 'conversations', convoId, 'messages');
      const timestamp = Timestamp.now();
      await addDoc(messagesRef, { ...message, timestamp });

      const convoRef = doc(db, 'conversations', convoId);
      await updateDoc(convoRef, {
          lastMessage: message.text,
          lastMessageSenderId: message.senderId,
          lastMessageTimestamp: timestamp,
          readBy: [message.senderId]
      });
  },
  
  startChat: async (userId1: string, userId2: string, userName1: string, userName2: string): Promise<Conversation> => {
      const q = query(conversationsCollection, where('members', 'array-contains', userId1), where('isGroup', '==', false));
      const snapshot = await getDocs(q);
      const existingConvo = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Conversation))
        .find(convo => convo.members.includes(userId2) && convo.members.length === 2);

      if (existingConvo) return existingConvo;

      const members = [userId1, userId2].sort();
      const convoId = members.join('_');
      const convoRef = doc(db, 'conversations', convoId);
      
      const newConvoData: Omit<Conversation, 'id'> = {
          isGroup: false,
          members,
          memberNames: { [userId1]: userName1, [userId2]: userName2 },
          lastMessage: 'Chat started.',
          lastMessageSenderId: '',
          lastMessageTimestamp: Timestamp.now(),
          readBy: []
      };
      await setDoc(convoRef, newConvoData);

      return { id: convoId, ...newConvoData };
  },

  createGroupChat: async (name: string, memberIds: string[], memberNames: {[key: string]: string}): Promise<void> => {
      await addDoc(conversationsCollection, {
          isGroup: true,
          name,
          members: memberIds,
          memberNames,
          lastMessage: `${memberNames[memberIds[0]]} created the group.`,
          lastMessageSenderId: '',
          lastMessageTimestamp: Timestamp.now(),
          readBy: []
      });
  },
  
  getGroupMembers: async (memberIds: string[]): Promise<MemberUser[]> => {
      if (memberIds.length === 0) return [];
      const q = query(usersCollection, where('__name__', 'in', memberIds));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({...d.data(), id: d.id}) as MemberUser);
  },
  
  updateGroupMembers: (convoId: string, memberIds: string[], memberNames: {[key: string]: string}): Promise<void> => {
      const convoRef = doc(db, 'conversations', convoId);
      return updateDoc(convoRef, { members: memberIds, memberNames });
  },

  leaveGroup: (convoId: string, userId: string): Promise<void> => {
      const convoRef = doc(db, 'conversations', convoId);
      return updateDoc(convoRef, { members: arrayRemove(userId) });
  },

  // Notifications
  listenForNotifications: (userId: string, callback: (notifications: Notification[]) => void): () => void => {
      const q = query(notificationsCollection, where('userId', '==', userId), orderBy('timestamp', 'desc'), limit(50));
      return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification))));
  },

  listenForActivity: (callback: (activities: Activity[]) => void): () => void => {
      const q = query(activityFeedCollection, orderBy('timestamp', 'desc'), limit(50));
      return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity))));
  },
  
  markNotificationAsRead: (notificationId: string): Promise<void> => {
      const notifRef = doc(db, 'notifications', notificationId);
      return updateDoc(notifRef, { read: true });
  },
  
  markAllNotificationsAsRead: async (userId: string): Promise<void> => {
    const q = query(notificationsCollection, where('userId', '==', userId), where('read', '==', false));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => batch.update(doc.ref, { read: true }));
    await batch.commit();
  },
};