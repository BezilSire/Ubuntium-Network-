
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
  startAfter,
  DocumentSnapshot,
  DocumentData,
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

/**
 * Securely fetches user profiles from a list of UIDs using batched 'in' queries.
 * This is efficient and works with security rules that allow 'get' but not broad 'list' operations on the users collection.
 */
const fetchUsersByUids = async (uids: string[], options?: { includeInactive?: boolean }): Promise<User[]> => {
    if (uids.length === 0) return [];
    
    // Firestore 'in' queries are limited to 30 items.
    const uidsChunks: string[][] = [];
    for (let i = 0; i < uids.length; i += 30) {
        uidsChunks.push(uids.slice(i, i + 30));
    }

    const userPromises = uidsChunks.map(chunk => 
        getDocs(query(usersCollection, where('__name__', 'in', chunk)))
    );

    const userSnapshots = await Promise.all(userPromises);
    const users = userSnapshots.flatMap(snap => snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    
    if (options?.includeInactive) {
        return users;
    }
    
    // Filter for active users on the client side by default
    return users.filter(user => user.status === 'active');
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
    // Securely build a list of users by looking at recent posters to avoid broad, permission-denied queries on 'users' or 'members'.
    const q = query(postsCollection, orderBy("date", "desc"), limit(500));
    const postsSnapshot = await getDocs(q);
    // FIX: Added explicit string[] type to fix incorrect type inference.
    const authorUids: string[] = Array.from(new Set(postsSnapshot.docs.map(doc => doc.data().authorId).filter((id): id is string => typeof id === 'string' && !!id)));
    
    // This will only find active users by default, which is correct for a search context.
    return await fetchUsersByUids(authorUids);
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
    if (agent.role !== 'agent') {
        throw new Error("Permission denied: Only agents can register new members.");
    }
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

  getAgentMembers: async (currentUser: User): Promise<Member[]> => {
    if (currentUser.role !== 'agent') {
      throw new Error("Permission denied: only agents can view their members.");
    }
    const q = query(membersCollection, where("agent_id", "==", currentUser.id));
    const querySnapshot = await getDocs(q);
    const members = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
    members.sort((a, b) => new Date(b.date_registered).getTime() - new Date(a.date_registered).getTime());
    return members;
  },
  
  // Admin actions
  listenForAllUsers: (currentUser: User, callback: (users: User[]) => void, onError: (error: Error) => void): (() => void) => {
      if (currentUser.role !== 'admin') {
        onError(new Error("Permission denied: Admin access required."));
        return () => {};
      }
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
  
  updateUserRole: async (currentUser: User, uid: string, newRole: User['role']): Promise<void> => {
    if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, { role: newRole });
  },

  listenForAllMembers: (currentUser: User, callback: (members: Member[]) => void, onError: (error: Error) => void): () => void => {
      if (currentUser.role !== 'admin') {
        onError(new Error("Permission denied: Admin access required."));
        return () => {};
      }
      const q = query(membersCollection);
      return onSnapshot(q,
        (snapshot) => {
            const members = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
            members.sort((a, b) => new Date(b.date_registered).getTime() - new Date(a.date_registered).getTime());
            
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
  
  listenForPendingMembers: (currentUser: User, callback: (members: Member[]) => void, onError: (error: Error) => void): () => void => {
      if (currentUser.role !== 'admin') {
        onError(new Error("Permission denied: Admin access required."));
        return () => {};
      }
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

  listenForAllAgents: (currentUser: User, callback: (agents: Agent[]) => void, onError: (error: Error) => void): () => void => {
      if (currentUser.role !== 'admin') {
        onError(new Error("Permission denied: Admin access required."));
        return () => {};
      }
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

  approveMember: async (currentUser: User, member: Member): Promise<void> => {
      if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
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
      
      const activity: Omit<Activity, 'id'> = {
          type: 'NEW_MEMBER',
          message: `${member.full_name} from ${member.circle} has joined the commons!`,
          link: member.uid,
          causerId: member.uid,
          causerName: member.full_name,
          causerCircle: member.circle,
          timestamp: Timestamp.now(),
      };
      const activityRef = doc(collection(db, 'activity_feed'));
      batch.set(activityRef, activity);

      await batch.commit();
  },

  rejectMember: async (currentUser: User, member: Member): Promise<void> => {
      if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
      const batch = writeBatch(db);
      const memberRef = doc(db, 'members', member.id);
      batch.update(memberRef, { payment_status: 'rejected' });
      
      if (member.uid) {
          const userRef = doc(db, 'users', member.uid);
          batch.update(userRef, { status: 'ousted' });
      }
      await batch.commit();
  },

  sendBroadcast: async (currentUser: User, message: string): Promise<Broadcast> => {
    if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
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
  
   updatePaymentStatus: async (currentUser: User, memberId: string, status: Member['payment_status']): Promise<void> => {
      if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
      const memberDocRef = doc(db, 'members', memberId);
      await updateDoc(memberDocRef, { payment_status: status });
  },
  
  resetDistressQuota: async (currentUser: User, uid: string): Promise<void> => {
      if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { distress_calls_available: 2 });
  },
  
  clearLastDistressPost: async (currentUser: User, uid: string): Promise<void> => {
      if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
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

  getNewMembersInCircle: async (circle: string, currentUserId: string): Promise<User[]> => {
    // Query by the most selective field first to reduce documents read.
    const q = query(
        activityFeedCollection, 
        where("type", "==", "NEW_MEMBER"), 
        orderBy("timestamp", "desc"),
        limit(150) // Fetch a larger pool to filter from
    );
    const snapshot = await getDocs(q);
    const activities = snapshot.docs
        .map(doc => doc.data() as Activity)
        .filter(activity => activity.causerCircle === circle); // Client-side filter for circle

    const memberUids = activities.slice(0, 12)
        .map(activity => activity.causerId)
        .filter((uid): uid is string => typeof uid === 'string' && !!uid && uid !== currentUserId);

    if (memberUids.length === 0) return [];
    
    const uniqueUids: string[] = Array.from(new Set(memberUids));
    return await fetchUsersByUids(uniqueUids);
  },

  getMembersInSameCircle: async (circle: string, currentUserId: string): Promise<User[]> => {
    const q = query(
        postsCollection, 
        where("authorCircle", "==", circle),
        limit(300) // Fetch more to sort and find unique authors
    );
    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map(doc => doc.data() as Post);
    posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const authorUids = posts
        .map(post => post.authorId)
        .filter((uid): uid is string => typeof uid === 'string' && !!uid && uid !== currentUserId);

    if (authorUids.length === 0) return [];

    const uniqueUids: string[] = Array.from(new Set(authorUids));
    const users = await fetchUsersByUids(uniqueUids);
    return users.slice(0, 50); // Return up to 50 users from the circle
  },
  
  exploreMembers: async (currentUserId: string, currentUserCircle: string | undefined, limitNum: number = 12): Promise<User[]> => {
    const q = query(
        postsCollection,
        orderBy("date", "desc"),
        limit(300) // Get a large pool of recent posts
    );
    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map(doc => doc.data() as Post);

    let memberUids = posts
        .filter(post => currentUserCircle ? post.authorCircle !== currentUserCircle : true) // Client-side filter
        .map(post => post.authorId)
        .filter((uid): uid is string => typeof uid === 'string' && !!uid && uid !== currentUserId);

    // Fallback if no one is found outside the circle (or user has no circle)
    if (memberUids.length === 0 && snapshot.docs.length > 0) {
      memberUids = snapshot.docs
        .map(doc => doc.data().authorId)
        .filter((uid): uid is string => typeof uid === 'string' && !!uid && uid !== currentUserId);
    }
    
    const uniqueUids: string[] = Array.from(new Set(memberUids));
    if (uniqueUids.length === 0) return [];

    const users = await fetchUsersByUids(uniqueUids);
    
    const shuffled = users.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, limitNum);
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
      
      let activityType: Activity['type'] | null = null;
      if (type === 'proposal') activityType = 'NEW_POST_PROPOSAL';
      else if (type === 'opportunity') activityType = 'NEW_POST_OPPORTUNITY';
      else if (type === 'offer') activityType = 'NEW_POST_OFFER';
      else if (type === 'general') activityType = 'NEW_POST_GENERAL';

      if (activityType) {
          const activity: Omit<Activity, 'id'> = {
              type: activityType,
              message: `${author.name} created a new ${type} post.`,
              link: postRef.id,
              causerId: author.id,
              causerName: author.name,
              causerCircle: author.circle || 'Unknown',
              timestamp: Timestamp.now(),
          };
          await addDoc(activityFeedCollection, activity);
      }
      
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

  createDistressPost: async (currentUser: MemberUser, content: string): Promise<User> => {
      if (currentUser.role !== 'member') {
          throw new Error("Permission denied: only members can send distress calls.");
      }
      if (currentUser.distress_calls_available <= 0) {
          throw new Error("No distress calls available.");
      }
      
      const newPostData: Omit<Post, 'id'> = {
          authorId: currentUser.id,
          authorName: "Anonymous Member",
          authorCircle: currentUser.circle || 'Unknown',
          content,
          date: new Date().toISOString(),
          upvotes: [],
          commentCount: 0,
          repostCount: 0,
          type: 'distress',
      };
      const postRef = await addDoc(postsCollection, newPostData);
      
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
          distress_calls_available: currentUser.distress_calls_available - 1,
          last_distress_post_id: postRef.id
      });
      
      const updatedUser = await getUserProfile(currentUser.id);
      if (!updatedUser) throw new Error("Could not refetch user profile.");
      return updatedUser;
  },

  listenForPosts: (filter: Post['type'] | 'all', callback: (posts: Post[]) => void, onError: (error: Error) => void): (() => void) => {
    // This function is now only used for single-type feeds (like distress) and the old real-time 'all' feed logic is deprecated
    // in favor of the paginated fetch functions below.
    if (filter === 'all') {
      onError(new Error("'all' filter is deprecated for real-time listeners. Use paginated fetch functions instead."));
      callback([]);
      return () => {};
    }

    const q = query(postsCollection, where("type", "==", filter), limit(50));
        
    return onSnapshot(q,
        (snapshot) => {
            const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
            posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            callback(posts);
        },
        (error) => {
            console.error(`Firestore listener error (posts, filter: ${filter}):`, error);
            onError(error);
        }
    );
  },

  fetchPinnedPosts: async (): Promise<Post[]> => {
    const q = query(postsCollection, where("isPinned", "==", true));
    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
    // Sort client-side to avoid needing a composite index
    posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return posts;
  },

  fetchRegularPosts: async (limitNum: number, lastVisible?: DocumentSnapshot<DocumentData>): Promise<{ posts: Post[], lastVisible: DocumentSnapshot<DocumentData> | null }> => {
    const allowedInAllFeed: Post['type'][] = ['general', 'proposal', 'offer', 'opportunity'];
    
    // Fetch a larger batch to account for client-side filtering.
    const queryLimit = limitNum * 3;

    const constraints: any[] = [
        orderBy("date", "desc"),
        limit(queryLimit)
    ];

    if (lastVisible) {
        constraints.push(startAfter(lastVisible));
    }

    // Query without type filter to avoid composite index
    const q = query(postsCollection, ...constraints);
    const snapshot = await getDocs(q);
    
    // Filter client-side
    const posts = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Post))
        .filter(p => allowedInAllFeed.includes(p.type));
        
    // The new cursor is the last document from the *unfiltered* query result.
    const newLastVisible = snapshot.docs[snapshot.docs.length - 1];

    return { posts, lastVisible: newLastVisible || null };
  },

  listenForPostsByAuthor: (authorId: string, callback: (posts: Post[]) => void, onError: (error: Error) => void): (() => void) => {
      // Removed orderBy from query to prevent needing a composite index
      const q = query(postsCollection, where("authorId", "==", authorId), limit(50));
      return onSnapshot(q, (snapshot) => {
          const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
          // Sort client-side
          posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          callback(posts);
      }, onError);
  },

  listenForFollowingPosts: (followingIds: string[], callback: (posts: Post[]) => void, onError: (error: Error) => void): (() => void) => {
      if (followingIds.length === 0) {
          callback([]);
          return () => {};
      }
      const chunks: string[][] = [];
      for (let i = 0; i < followingIds.length; i += 30) {
        chunks.push(followingIds.slice(i, i + 30));
      }
      
      const postMap = new Map<string, Post>();

      const unsubscribers = chunks.map(chunk => {
        // Removed orderBy from query to prevent needing a composite index
        const q = query(postsCollection, where("authorId", "in", chunk), limit(50));
        return onSnapshot(q, (snapshot) => {
            snapshot.docs.forEach(doc => {
              postMap.set(doc.id, { id: doc.id, ...doc.data() } as Post);
            });
            const allPosts = Array.from(postMap.values());
            // This existing client-side sort is now essential
            allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            callback(allPosts);
        }, onError);
      });
      
      return () => unsubscribers.forEach(unsub => unsub());
  },
  
  togglePinPost: async (currentUser: User, postId: string, newPinState: boolean): Promise<void> => {
    if (currentUser.role !== 'admin') {
        throw new Error("Permission denied: Admin access required.");
    }
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, { isPinned: newPinState });
  },

  upvotePost: async (postId: string, userId: string): Promise<void> => {
    const postRef = doc(db, 'posts', postId);
    const postDoc = await getDoc(postRef);
    if (postDoc.exists()) {
      const postData = postDoc.data() as Post;
      if (postData.upvotes.includes(userId)) {
        // User has already liked, so unlike
        await updateDoc(postRef, { upvotes: arrayRemove(userId) });
      } else {
        // User has not liked, so like
        await updateDoc(postRef, { upvotes: arrayUnion(userId) });
      }
    }
  },

  deletePost: async (postId: string): Promise<void> => {
    const postRef = doc(db, 'posts', postId);
    await deleteDoc(postRef);
  },
  
  deleteDistressPost: async (currentUser: User, postId: string, authorId: string): Promise<void> => {
    if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
    const batch = writeBatch(db);
    const postRef = doc(db, 'posts', postId);
    batch.delete(postRef);
    const userRef = doc(db, 'users', authorId);
    batch.update(userRef, { last_distress_post_id: null });
    await batch.commit();
  },

  updatePost: async (postId: string, content: string): Promise<void> => {
    const postRef = doc(db, 'posts', postId);
    await updateDoc(postRef, { content });
  },

  reportPost: async (reporter: User, post: Post, reason: string, details: string): Promise<void> => {
    const reportData: Omit<Report, 'id'> = {
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
    await addDoc(reportsCollection, reportData);
  },
  
  reportUser: async (reporter: User, reportedUser: User, reason: string, details: string): Promise<void> => {
    const reportData: Omit<UserReport, 'id'> = {
        reporterId: reporter.id,
        reporterName: reporter.name,
        reportedUserId: reportedUser.id,
        reportedUserName: reportedUser.name,
        reason,
        details,
        date: new Date().toISOString(),
        status: 'new'
    };
    await addDoc(userReportsCollection, reportData);
  },
  
  listenForReports: (currentUser: User, callback: (reports: Report[]) => void, onError: (error: Error) => void): (() => void) => {
    if (currentUser.role !== 'admin') {
        onError(new Error("Permission denied: Admin access required."));
        return () => {};
    }
    const q = query(reportsCollection, orderBy("date", "desc"));
    return onSnapshot(q, (snapshot) => {
        const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
        callback(reports);
    }, onError);
  },

  resolvePostReport: async(currentUser: User, reportId: string, postId: string, authorId: string): Promise<void> => {
    if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
    const batch = writeBatch(db);
    
    // Mark report as resolved
    const reportRef = doc(db, 'reports', reportId);
    batch.update(reportRef, { status: 'resolved' });

    // Delete the offending post
    const postRef = doc(db, 'posts', postId);
    batch.delete(postRef);

    // Penalize the user
    const userRef = doc(db, 'users', authorId);
    batch.update(userRef, { credibility_score: increment(-25) });
    
    await batch.commit();
  },
  
  dismissReport: async(currentUser: User, reportId: string): Promise<void> => {
    if (currentUser.role !== 'admin') throw new Error("Permission denied: Admin access required.");
    const reportRef = doc(db, 'reports', reportId);
    await updateDoc(reportRef, { status: 'resolved' });
  },

  // ... (rest of the functions: chat, notifications, etc.)
  getChatContacts: async (currentUser: User, includeSelf = false): Promise<User[]> => {
    if (currentUser.role === 'agent') return []; // Agents can't start chats
    let uids: string[] = [];
    if (currentUser.role === 'admin') {
        const q = query(usersCollection, where('status', '==', 'active'));
        const snapshot = await getDocs(q);
        uids = snapshot.docs.map(d => d.id);
    } else { // Member
        const following = currentUser.following || [];
        const followers = currentUser.followers || [];
        uids = [...new Set([...following, ...followers])];
    }
    if (!includeSelf) {
        uids = uids.filter(id => id !== currentUser.id);
    }
    return fetchUsersByUids(uids);
  },
  
  startChat: async (currentUserId: string, targetUserId: string, currentUserName: string, targetUserName: string): Promise<Conversation> => {
      // Check if a 1-on-1 chat already exists
      const members = [currentUserId, targetUserId].sort();
      // Query only by members array to avoid composite index
      const q = query(conversationsCollection, where('members', '==', members), limit(5));
      const snapshot = await getDocs(q);

      // Find the 1-on-1 chat from the results on the client
      const existingConvoDoc = snapshot.docs.find(doc => doc.data().isGroup === false);

      if (existingConvoDoc) {
          return { id: existingConvoDoc.id, ...existingConvoDoc.data() } as Conversation;
      }
      
      // If not, create a new one
      const newConvo: Omit<Conversation, 'id'> = {
          isGroup: false,
          members,
          memberNames: {
              [currentUserId]: currentUserName,
              [targetUserId]: targetUserName,
          },
          lastMessage: "Conversation started.",
          lastMessageSenderId: '',
          lastMessageTimestamp: Timestamp.now(),
          readBy: [currentUserId],
      };
      const docRef = await addDoc(conversationsCollection, newConvo);
      return { id: docRef.id, ...newConvo };
  },

  createGroupChat: async (name: string, memberIds: string[], memberNames: {[key: string]: string}): Promise<Conversation> => {
      const newGroup: Omit<Conversation, 'id'> = {
          isGroup: true,
          name,
          members: memberIds,
          memberNames,
          lastMessage: "Group created.",
          lastMessageSenderId: '',
          lastMessageTimestamp: Timestamp.now(),
          readBy: [],
      };
      const docRef = await addDoc(conversationsCollection, newGroup);
      return { id: docRef.id, ...newGroup };
  },

  getGroupMembers: async (memberIds: string[]): Promise<MemberUser[]> => {
    const users = await fetchUsersByUids(memberIds, { includeInactive: true });
    return users as MemberUser[];
  },

  updateGroupMembers: async (convoId: string, newMemberIds: string[], newMemberNames: {[key:string]:string}) => {
      const convoRef = doc(db, 'conversations', convoId);
      await updateDoc(convoRef, { members: newMemberIds, memberNames: newMemberNames });
  },

  leaveGroup: async (convoId: string, userId: string) => {
      const convoRef = doc(db, 'conversations', convoId);
      const user = await getUserProfile(userId);
      await updateDoc(convoRef, {
          members: arrayRemove(userId),
          lastMessage: `${user?.name} left the group.`,
          lastMessageSenderId: '',
          lastMessageTimestamp: Timestamp.now(),
      });
  },

  listenForConversations: (userId: string, callback: (convos: Conversation[]) => void, onError: (error: Error) => void): (() => void) => {
    const q = query(conversationsCollection, where('members', 'array-contains', userId));
    return onSnapshot(q, (snapshot) => {
      const convos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
      convos.sort((a, b) => b.lastMessageTimestamp.toMillis() - a.lastMessageTimestamp.toMillis());
      callback(convos);
    }, onError);
  },
  
  listenForMessages: (conversationId: string, callback: (messages: Message[]) => void): (() => void) => {
      const messagesCol = collection(db, 'conversations', conversationId, 'messages');
      const q = query(messagesCol, orderBy('timestamp', 'asc'));
      return onSnapshot(q, async (snapshot) => {
          const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
          callback(messages);

          // Mark conversation as read
          const user = auth.currentUser;
          if (user) {
              const convoRef = doc(db, 'conversations', conversationId);
              await updateDoc(convoRef, { readBy: arrayUnion(user.uid) });
          }
      });
  },

  sendMessage: async (conversationId: string, message: Omit<Message, 'id' | 'timestamp'>, conversation: Conversation): Promise<void> => {
      const batch = writeBatch(db);
      
      const messagesCol = collection(db, 'conversations', conversationId, 'messages');
      const newMessageRef = doc(messagesCol);
      batch.set(newMessageRef, { ...message, timestamp: Timestamp.now() });

      const convoRef = doc(db, 'conversations', conversationId);
      batch.update(convoRef, {
          lastMessage: message.text,
          lastMessageSenderId: message.senderId,
          lastMessageTimestamp: Timestamp.now(),
          readBy: [message.senderId], // Only sender has read it initially
      });

      // Send notifications to other members
      const sender = await getUserProfile(message.senderId);
      conversation.members.forEach(memberId => {
          if (memberId !== message.senderId && sender) {
              const notif: Omit<Notification, 'id'> = {
                  userId: memberId,
                  type: 'NEW_MESSAGE',
                  message: `${conversation.isGroup ? `${sender.name} in ${conversation.name}`: sender.name}: ${message.text}`,
                  link: conversationId,
                  causerId: sender.id,
                  causerName: sender.name,
                  timestamp: Timestamp.now(),
                  read: false,
              };
              const notifRef = doc(collection(db, 'notifications'));
              batch.set(notifRef, notif);
          }
      });
      
      await batch.commit();
  },
  
  followUser: async (currentUserId: string, targetUserId: string): Promise<void> => {
    const batch = writeBatch(db);
    const currentUserRef = doc(db, 'users', currentUserId);
    const targetUserRef = doc(db, 'users', targetUserId);
    batch.update(currentUserRef, { following: arrayUnion(targetUserId) });
    batch.update(targetUserRef, { followers: arrayUnion(currentUserId) });
    
    // Create notification for the user being followed
    const currentUser = await getUserProfile(currentUserId);
    if(currentUser) {
        const notif: Omit<Notification, 'id'> = {
            userId: targetUserId,
            type: 'NEW_FOLLOWER',
            message: `${currentUser.name} started following you.`,
            link: currentUserId,
            causerId: currentUserId,
            causerName: currentUser.name,
            timestamp: Timestamp.now(),
            read: false,
        };
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, notif);
    }
    await batch.commit();
  },

  unfollowUser: async (currentUserId: string, targetUserId: string): Promise<void> => {
    const batch = writeBatch(db);
    const currentUserRef = doc(db, 'users', currentUserId);
    const targetUserRef = doc(db, 'users', targetUserId);
    batch.update(currentUserRef, { following: arrayRemove(targetUserId) });
    batch.update(targetUserRef, { followers: arrayRemove(currentUserId) });
    await batch.commit();
  },

  listenForNotifications: (userId: string, callback: (notifs: Notification[]) => void, onError: (error: Error) => void): (() => void) => {
    // Remove orderBy to avoid needing a composite index. Sorting will be done client-side.
    const q = query(notificationsCollection, where('userId', '==', userId), limit(50));
    return onSnapshot(q, (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
        // Sort by timestamp descending on the client
        notifs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
        callback(notifs);
    }, onError);
  },

  listenForActivity: (callback: (activities: Activity[]) => void, onError: (error: Error) => void): (() => void) => {
      const q = query(activityFeedCollection, orderBy('timestamp', 'desc'), limit(50));
      return onSnapshot(q, (snapshot) => {
          const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
          callback(activities);
      }, onError);
  },

  markNotificationAsRead: async (notificationId: string): Promise<void> => {
      const notifRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifRef, { read: true });
  },

  markAllNotificationsAsRead: async (userId: string): Promise<void> => {
    // Query only by userId to avoid composite index.
    const q = query(notificationsCollection, where('userId', '==', userId), limit(100));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
        // Filter for unread notifications on the client before adding to batch.
        if (doc.data().read === false) {
            batch.update(doc.ref, { read: true });
        }
    });
    await batch.commit();
  },
  
  addComment: async (postId: string, commentData: Omit<Comment, 'id' | 'timestamp'>): Promise<void> => {
      const batch = writeBatch(db);
      
      const commentsCol = collection(db, 'posts', postId, 'comments');
      const newCommentRef = doc(commentsCol);
      batch.set(newCommentRef, { ...commentData, timestamp: Timestamp.now() });

      const postRef = doc(db, 'posts', postId);
      batch.update(postRef, { commentCount: increment(1) });
      
      // Add notification for post author
      const postDoc = await getDoc(postRef);
      const post = postDoc.data() as Post;

      if(post && commentData.authorId !== post.authorId) {
          const notif: Omit<Notification, 'id'> = {
            userId: post.authorId,
            type: 'POST_COMMENT',
            message: `${commentData.authorName} commented on your post.`,
            link: postId,
            causerId: commentData.authorId,
            causerName: commentData.authorName,
            timestamp: Timestamp.now(),
            read: false,
        };
        const notifRef = doc(collection(db, 'notifications'));
        batch.set(notifRef, notif);
      }
      
      await batch.commit();
  },

  deleteComment: async (postId: string, commentId: string): Promise<void> => {
    const batch = writeBatch(db);
    const commentRef = doc(db, 'posts', postId, 'comments', commentId);
    batch.delete(commentRef);
    const postRef = doc(db, 'posts', postId);
    batch.update(postRef, { commentCount: increment(-1) });
    await batch.commit();
  },
  
  upvoteComment: async (postId: string, commentId: string, userId: string): Promise<void> => {
    const commentRef = doc(db, 'posts', postId, 'comments', commentId);
    const commentDoc = await getDoc(commentRef);
    if (commentDoc.exists()) {
      const commentData = commentDoc.data() as Comment;
      if (commentData.upvotes.includes(userId)) {
        await updateDoc(commentRef, { upvotes: arrayRemove(userId) });
      } else {
        await updateDoc(commentRef, { upvotes: arrayUnion(userId) });
      }
    }
  },

  listenForComments: (postId: string, callback: (comments: Comment[]) => void): (() => void) => {
    const commentsCol = collection(db, 'posts', postId, 'comments');
    const q = query(commentsCol, orderBy('timestamp', 'asc'));
    return onSnapshot(q, (snapshot) => {
      const comments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment));
      callback(comments);
    });
  },

};
