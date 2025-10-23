

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
  runTransaction,
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
const PUBLIC_POST_TYPES: Post['types'][] = ['general', 'proposal', 'offer', 'opportunity'];

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
  fetchUsersByUids, 

  awardKnowledgePoints: async (userId: string): Promise<boolean> => {
    const userRef = doc(db, 'users', userId);
    let wasAwarded = false;
    try {
      await runTransaction(db, async (transaction) => {
        const userDoc = await transaction.get(userRef);
        if (!userDoc.exists()) {
          throw "User document does not exist!";
        }
        const userData = userDoc.data() as User;
        if (!userData.hasReadKnowledgeBase) {
          transaction.update(userRef, {
            knowledgePoints: increment(10),
            hasReadKnowledgeBase: true,
          });
          wasAwarded = true;
        }
      });
      return wasAwarded;
    } catch (e) {
      console.error("Knowledge points transaction failed: ", e);
      return false;
    }
  },

  getSearchableUsers: async (currentUser: User): Promise<User[]> => {
    if (currentUser.role === 'agent') {
      return [];
    }
    if (currentUser.role === 'admin') {
      // Admins can search everyone, including pending users.
      const q = query(usersCollection, where('status', 'in', ['active', 'pending']));
      const snapshot = await getDocs(q);
      const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      return users.filter(user => user.id !== currentUser.id);
    } 
    
    // For members, search is limited to their existing chat contacts to avoid permission errors.
    return api.getChatContacts(currentUser, false);
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
      const q = query(usersCollection, orderBy('name'));
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
      const q = query(membersCollection, orderBy('date_registered', 'desc'));
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
  
  listenForPendingMembers: (currentUser: User, callback: (members: Member[]) => void, onError: (error: Error) => void): (() => void) => {
      if (currentUser.role !== 'admin') {
        onError(new Error("Permission denied: Admin access required."));
        return () => {};
      }
      const q = query(membersCollection, where('payment_status', '==', 'pending_verification'));
      return onSnapshot(q, 
        (snapshot) => {
            const pendingMembers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
            pendingMembers.sort((a, b) => new Date(a.date_registered).getTime() - new Date(b.date_registered).getTime());
            callback(pendingMembers);
        },
        (error) => {
            console.error("Firestore listener error (pending members):", error);
            onError(error);
        }
      );
  },

  listenForAllAgents: (currentUser: User, callback: (agents: Agent[]) => void, onError: (error: Error) => void): (() => void) => {
      if (currentUser.role !== 'admin') {
        onError(new Error("Permission denied: Admin access required."));
        return () => {};
      }
      const q = query(usersCollection, where('role', '==', 'agent'));
      return onSnapshot(q,
        (snapshot) => {
            const agents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent));
            agents.sort((a, b) => a.name.localeCompare(b.name));
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
      
      let welcome_message = `Welcome to the Ubuntium Global Commons, ${member.full_name}! We are thrilled to have you join the ${member.circle} Circle. I am because we are.`;
      let needs_welcome_update = false;

      try {
          welcome_message = await generateWelcomeMessage(member.full_name, member.circle);
      } catch (error) {
          console.warn("Could not generate welcome message during approval (likely offline). Using default and flagging for update.", error);
          needs_welcome_update = true;
      }

      const batch = writeBatch(db);

      const memberRef = doc(db, 'members', member.id);
      const memberUpdatePayload: any = { 
          payment_status: 'complete', 
          welcome_message,
          membership_card_id: `UGC-M-${Date.now()}`
      };
      if (needs_welcome_update) {
          memberUpdatePayload.needs_welcome_update = true;
      }
      batch.update(memberRef, memberUpdatePayload);


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
    const q = query(broadcastsCollection, limit(20));
    const querySnapshot = await getDocs(q);
    const broadcasts = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Broadcast));
    broadcasts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return broadcasts;
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
  
  // This function will require a composite index in Firestore on 'users': `role` (asc), `status` (in-filter), and `name` (ascending).
  fetchCommunityMembersPaginated: async (
    limitNum: number,
    lastVisible?: DocumentSnapshot<DocumentData>
  ): Promise<{ users: User[], lastVisible: DocumentSnapshot<DocumentData> | null }> => {
    const constraints: any[] = [
        where('role', '==', 'member'),
        where('status', 'in', ['active', 'pending']),
        orderBy('name'),
        limit(limitNum)
    ];
    if (lastVisible) {
        constraints.push(startAfter(lastVisible));
    }
    const q = query(usersCollection, ...constraints);
    const snapshot = await getDocs(q);
    const users = snapshot.docs.map(doc => {
        const data = doc.data();
        // Construct a truly lightweight user object for the list view.
        return {
            id: doc.id,
            name: data.name,
            email: data.email, // Required by User type
            role: data.role,   // Required by User type
            status: data.status,
            circle: data.circle,
        } as User;
    });
    const newLastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    return { users, lastVisible: newLastVisible };
  },
  
  createPost: async (author: User, content: string, type: Post['types']): Promise<Post> => {
      const newPostData: Omit<Post, 'id'> = {
          authorId: author.id,
          authorName: author.name,
          authorCircle: author.circle || 'Unknown',
          authorRole: author.role,
          content,
          date: new Date().toISOString(),
          upvotes: [],
          commentCount: 0,
          repostCount: 0,
          types: type,
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
        authorRole: author.role,
        content: comment,
        date: new Date().toISOString(),
        upvotes: [],
        commentCount: 0,
        repostCount: 0,
        types: 'general',
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
          authorRole: currentUser.role,
          content,
          date: new Date().toISOString(),
          upvotes: [],
          commentCount: 0,
          repostCount: 0,
          types: 'distress',
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

  listenForPosts: (filter: Post['types'] | 'all', callback: (posts: Post[]) => void, onError: (error: Error) => void): (() => void) => {
    // This function is now only used for single-type feeds (like distress) and the old real-time 'all' feed logic is deprecated
    // in favor of the paginated fetch functions below.
    if (filter === 'all') {
      onError(new Error("'all' filter is deprecated for real-time listeners. Use paginated fetch functions instead."));
      callback([]);
      return () => {};
    }

    const q = query(postsCollection, where("types", "==", filter), limit(50));
        
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

  fetchPinnedPosts: async (isAdminView: boolean): Promise<Post[]> => {
    // If an admin can see pinned distress posts, they should be included.
    const typesToFetch = isAdminView ? [...PUBLIC_POST_TYPES, 'distress'] : PUBLIC_POST_TYPES;

    // Using multiple queries instead of a single 'in' query to avoid potential security rule issues.
    const promises = typesToFetch.map(type => {
        const q = query(
            postsCollection,
            where("isPinned", "==", true),
            where("types", "==", type)
        );
        return getDocs(q);
    });

    const snapshots = await Promise.all(promises);
    const allPosts: Post[] = snapshots.flatMap(snapshot => 
        snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post))
    );

    allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return allPosts;
  },

  fetchRegularPosts: async (
    limitNum: number, 
    typeFilter: Post['types'] | 'all',
    isAdminView: boolean,
    lastVisible?: DocumentSnapshot<DocumentData>
  ): Promise<{ posts: Post[], lastVisible: DocumentSnapshot<DocumentData> | null }> => {
    
    // If a specific type is requested, use the simple and efficient query.
    // This supports pagination correctly.
    if (typeFilter !== 'all') {
      if (typeFilter === 'distress' && !isAdminView) {
        return { posts: [], lastVisible: null };
      }
      
      const constraints: any[] = [
        where("types", "==", typeFilter),
        orderBy("date", "desc"),
        limit(limitNum)
      ];
      if (lastVisible) {
        constraints.push(startAfter(lastVisible));
      }
      const q = query(postsCollection, ...constraints);
      const snapshot = await getDocs(q);
      const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      const newLastVisible = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
      return { posts, lastVisible: newLastVisible };
    }

    // --- Logic for 'all' feed ---
    // This part runs multiple queries in parallel to avoid 'IN' clauses which can fail security rules.
    // Pagination is disabled for this view to ensure stability.
    const allowedTypes = isAdminView ? [...PUBLIC_POST_TYPES, 'distress'] : PUBLIC_POST_TYPES;

    const promises = allowedTypes.map(type => {
        const q = query(
            postsCollection,
            where("types", "==", type),
            orderBy("date", "desc"),
            limit(limitNum) // Fetch `limitNum` of *each type* to build a diverse feed.
        );
        return getDocs(q);
    });

    const snapshots = await Promise.all(promises);
    const allPosts: Post[] = snapshots.flatMap(snapshot => 
        snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post))
    );

    allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    
    // We return the top `limitNum` posts, and null for lastVisible to signal that pagination is not supported for this query.
    return { posts: allPosts.slice(0, limitNum), lastVisible: null };
  },

  listenForPostsByAuthor: (authorId: string, callback: (posts: Post[]) => void, onError: (error: Error) => void): (() => void) => {
    // This function is refactored to use multiple queries to avoid `IN` clauses on the `types` field,
    // which can be problematic for Firestore security rules.
    const postMap = new Map<string, Post>();
    const allUnsubscribers: (() => void)[] = [];
    const typesToFetch = [...PUBLIC_POST_TYPES]; // Can be extended for admin view if needed

    typesToFetch.forEach(type => {
        const q = query(
            postsCollection,
            where("authorId", "==", authorId),
            where("types", "==", type),
            orderBy("date", "desc"),
            limit(50) // Limit per type to avoid over-fetching
        );

        const unsub = onSnapshot(q, (snapshot) => {
            snapshot.docs.forEach(doc => {
                postMap.set(doc.id, { id: doc.id, ...doc.data() } as Post);
            });
            const allPosts = Array.from(postMap.values());
            allPosts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            callback(allPosts);
        }, onError);

        allUnsubscribers.push(unsub);
    });

    return () => allUnsubscribers.forEach(unsub => unsub());
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
        
        // Add notification if it's not the user's own post
        if (userId !== postData.authorId) {
            const upvoter = await getUserProfile(userId);
            if (upvoter) {
                const notif: Omit<Notification, 'id'> = {
                    userId: postData.authorId,
                    type: 'POST_LIKE',
                    message: `${upvoter.name} liked your post.`,
                    link: postId,
                    causerId: userId,
                    causerName: upvoter.name,
                    timestamp: Timestamp.now(),
                    read: false,
                };
                const notifRef = doc(collection(db, 'notifications'));
                await setDoc(notifRef, notif);
            }
        }
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
    const q = query(reportsCollection, orderBy('date', 'desc'));
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

  getChatContacts: async (currentUser: User, includeSelf = false): Promise<User[]> => {
    if (currentUser.role === 'agent') return [];

    let users: User[];

    if (currentUser.role === 'admin') {
      // Admins can contact all active users
      const q = query(usersCollection, where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      users = snapshot.docs.map(d => ({id: d.id, ...d.data()} as User));
    } else { // 'member'
      // For members, derive contacts from existing conversations to respect security rules.
      // This avoids a direct query on the `users` collection which would fail due to permissions.
      const q = query(conversationsCollection, where('members', 'array-contains', currentUser.id));
      const snapshot = await getDocs(q);
      const conversations = snapshot.docs.map(doc => doc.data() as Conversation);

      const contactMap = new Map<string, Partial<User>>();
      conversations.forEach(convo => {
        convo.members.forEach(memberId => {
          if (!contactMap.has(memberId)) {
            contactMap.set(memberId, {
              id: memberId,
              name: convo.memberNames[memberId] || 'Unknown Member',
              // We don't have role/circle here. Assume role and leave circle blank for a cleaner UI.
              role: 'member',
              circle: '', // Set to empty string.
            });
          }
        });
      });
      // The `as User[]` cast is technically incorrect as these are partial objects,
      // but it's a necessary evil to make it compatible with components that expect User[].
      // The components using this (GlobalSearch, MemberSearchModal) can handle the missing `circle`.
      users = Array.from(contactMap.values()) as User[];
    }
    
    if (!includeSelf) {
      users = users.filter(user => user.id !== currentUser.id);
    }
    return users;
  },
  
  startChat: async (currentUserId: string, targetUserId: string, currentUserName: string, targetUserName: string): Promise<Conversation> => {
      // Query for conversations the current user is a part of. This is secure and efficient.
      const q = query(conversationsCollection, where('members', 'array-contains', currentUserId));
      const snapshot = await getDocs(q);

      // Filter client-side to find the specific 1-on-1 chat.
      const existingConvoDoc = snapshot.docs.find(doc => {
          const data = doc.data();
          // A 1-on-1 chat is not a group, has exactly two members, and includes the target user.
          return data.isGroup === false && data.members.length === 2 && data.members.includes(targetUserId);
      });

      if (existingConvoDoc) {
          return { id: existingConvoDoc.id, ...existingConvoDoc.data() } as Conversation;
      }
      
      // If not, create a new one
      const newConvo: Omit<Conversation, 'id'> = {
          isGroup: false,
          members: [currentUserId, targetUserId].sort(), // Store sorted for consistency
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

  listenForNotifications: (userId: string, callback: (notifs: Notification[]) => void, onError: (error: Error) => void): (() => void) => {
    const q = query(notificationsCollection, where('userId', '==', userId), limit(50));
    return onSnapshot(q, (snapshot) => {
        const notifs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
        // Sort by timestamp descending on the client
        notifs.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
        callback(notifs);
    }, onError);
  },

  listenForActivity: (circle: string | undefined, callback: (activities: Activity[]) => void, onError: (error: Error) => void): (() => void) => {
      if (!circle) {
        // If user has no circle, don't fetch community activity.
        callback([]);
        return () => {};
      }
      const q = query(activityFeedCollection, where('causerCircle', '==', circle), limit(50));
      return onSnapshot(q, (snapshot) => {
          const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
          // Sort client-side since we can't use a composite index.
          activities.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
          callback(activities);
      }, onError);
  },
  
  listenForAllNewMemberActivity: (callback: (activities: Activity[]) => void, onError: (error: Error) => void): (() => void) => {
      const q = query(activityFeedCollection, where('type', '==', 'NEW_MEMBER'), limit(20));
      return onSnapshot(q, (snapshot) => {
          const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
          // Sort client-side since we can't use a composite index on timestamp.
          activities.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
          callback(activities);
      }, onError);
  },

  markNotificationAsRead: async (notificationId: string): Promise<void> => {
      const notifRef = doc(db, 'notifications', notificationId);
      await updateDoc(notifRef, { read: true });
  },

  markAllNotificationsAsRead: async (userId: string): Promise<void> => {
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
