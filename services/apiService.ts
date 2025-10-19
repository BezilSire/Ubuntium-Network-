

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
  serverTimestamp as firestoreServerTimestamp
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
    // Securely build a list of users from the public 'members' collection to avoid broad, permission-denied queries on 'users'.
    const membersSnapshot = await getDocs(query(membersCollection));
    const memberData = membersSnapshot.docs.map(doc => doc.data());

    const memberUids = memberData.map(m => m.uid).filter((uid): uid is string => !!uid);
    // FIX: Add type guard to ensure agentUids is string[]
    const agentUids = memberData.map(m => m.agent_id).filter((id): id is string => typeof id === 'string' && id !== 'PUBLIC_SIGNUP');
    
    const allUids = [...new Set([...memberUids, ...agentUids])];
    
    // This will only find active users by default, which is correct for a search context.
    return await fetchUsersByUids(allUids);
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
  listenForAllUsers: (callback: (users: User[]) => void, onError: (error: Error) => void): (() => void) => {
      const fetchAll = async () => {
          try {
              // Securely fetch users by getting IDs from the public `members` collection first.
              // Limitation: This may not find admins or agents who have never registered a member.
              const membersSnapshot = await getDocs(query(membersCollection));
              const memberData = membersSnapshot.docs.map(doc => doc.data());

              const memberUids = memberData.map(m => m.uid).filter((uid): uid is string => !!uid);
              // FIX: Add type guard to ensure agentUids is string[]
              const agentUids = memberData.map(m => m.agent_id).filter((id): id is string => typeof id === 'string' && id !== 'PUBLIC_SIGNUP');
              
              const allUids = [...new Set([...memberUids, ...agentUids])];
              
              if (allUids.length === 0) {
                  callback([]);
                  return;
              }

              const users = await fetchUsersByUids(allUids, { includeInactive: true });
              
              users.sort((a,b) => a.name.localeCompare(b.name));
              callback(users);
          } catch (e) {
              if (e instanceof Error) {
                  onError(e);
              } else {
                  onError(new Error('An unknown error occurred fetching users.'));
              }
          }
      };
      fetchAll();
      return () => {}; // Return a no-op unsubscribe function as this is now a one-time fetch.
  },
  
  updateUserRole: async (uid: string, newRole: User['role']): Promise<void> => {
    const userDocRef = doc(db, 'users', uid);
    await updateDoc(userDocRef, { role: newRole });
  },

  listenForAllMembers: (callback: (members: Member[]) => void, onError: (error: Error) => void): () => void => {
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
      const fetchAgents = async () => {
          try {
              // 1. Query the public `members` collection to get a list of agent IDs.
              // This avoids a broad query on the `users` collection.
              // Limitation: This will only find agents who have registered at least one member.
              const membersSnapshot = await getDocs(query(membersCollection));
              // FIX: Add type guard to ensure agentIds are strings
              const agentIds = [...new Set(membersSnapshot.docs.map(doc => doc.data().agent_id).filter((id): id is string => typeof id === 'string' && id !== 'PUBLIC_SIGNUP'))];

              if (agentIds.length === 0) {
                  callback([]);
                  return;
              }

              // 2. Fetch the full user profiles for these agent IDs.
              const agents = await fetchUsersByUids(agentIds, { includeInactive: true });
              callback(agents as Agent[]);

          } catch (e) {
              if (e instanceof Error) {
                  onError(e);
              } else {
                  onError(new Error('An unknown error occurred fetching agents.'));
              }
          }
      };
      fetchAgents();
      return () => {}; // Return a no-op unsubscribe function.
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

  getNewMembersInCircle: async (circle: string, currentUserId: string): Promise<User[]> => {
    const q = query(membersCollection, where("circle", "==", circle), limit(50));
    const snapshot = await getDocs(q);
    const memberUids = snapshot.docs
        .map(doc => doc.data().uid)
        .filter((uid): uid is string => !!uid && uid !== currentUserId);

    if (memberUids.length === 0) return [];
    
    const users = await fetchUsersByUids(memberUids);
    // Client-side sort, since we can't do this combined with a `where` on a different collection
    users.sort((a, b) => (b.lastSeen?.toMillis() || 0) - (a.lastSeen?.toMillis() || 0));

    return users.slice(0, 12);
  },

  getMembersInSameCircle: async (circle: string, currentUserId: string): Promise<User[]> => {
    const q = query(membersCollection, where("circle", "==", circle), limit(100)); // limit to avoid fetching too many
    const snapshot = await getDocs(q);
    const memberUids = snapshot.docs
        .map(doc => doc.data().uid)
        .filter((uid): uid is string => !!uid && uid !== currentUserId);

    if (memberUids.length === 0) return [];

    const users = await fetchUsersByUids(memberUids);
    return users.slice(0, 50);
  },
  
  exploreMembers: async (currentUserId: string, currentUserCircle: string | undefined, limitNum: number = 12): Promise<User[]> => {
    // This is less efficient but necessary without open permissions on `users` collection.
    // 1. Fetch a broad sample of members.
    const q = query(membersCollection, limit(200)); 
    const snapshot = await getDocs(q);
    
    // 2. Filter out own circle and self, get UIDs
    let memberUids = snapshot.docs
        .map(doc => ({ uid: doc.data().uid, circle: doc.data().circle }))
        .filter(item => item.uid && item.uid !== currentUserId && item.circle !== currentUserCircle)
        .map(item => item.uid as string);

    // Fallback if no one is found outside the circle
    if (memberUids.length === 0) {
      memberUids = snapshot.docs
        .map(doc => doc.data().uid)
        .filter((uid): uid is string => !!uid && uid !== currentUserId);
    }
    
    if (memberUids.length === 0) return [];

    // 3. Fetch user profiles for those UIDs
    const users = await fetchUsersByUids(memberUids);
    
    // 4. Shuffle and limit
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

  listenForPosts: (filter: Post['type'] | 'all', callback: (posts: Post[]) => void, onError: (error: Error) => void): () => void => {
    let q;
    const allowedInAllFeed: Post['type'][] = ['general', 'proposal', 'offer', 'opportunity'];

    if (filter === 'all') {
      // This query specifically asks for public post types, preventing permission errors from trying to access 'distress' posts.
      q = query(postsCollection, where('type', 'in', allowedInAllFeed), orderBy('date', 'desc'), limit(50));
    } else {
      // Ensure we never query for distress posts for regular feeds.
      if (filter === 'distress') {
        callback([]); // Return empty for distress filter on public feeds.
        return () => {};
      }
      q = query(postsCollection, where('type', '==', filter), orderBy('date', 'desc'), limit(50));
    }

    return onSnapshot(q, (snapshot) => {
      const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      callback(posts);
    }, (error) => {
      console.error(`Firestore listener error for posts (filter: ${filter}):`, error);
      onError(error);
    });
  },

  listenForPostsByAuthor: (authorId: string, callback: (posts: Post[]) => void, onError: (error: Error) => void): () => void => {
    const q = query(postsCollection, where("authorId", "==", authorId), limit(50));
    return onSnapshot(q, (snapshot) => {
        let posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        // Client-side sorting
        posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        callback(posts);
    }, (error) => {
        console.error(`Firestore listener error for posts by author (${authorId}):`, error);
        onError(error);
    });
  },

  getPostsByAuthor: async (authorId: string): Promise<Post[]> => {
    const q = query(postsCollection, where("authorId", "==", authorId));
    const snapshot = await getDocs(q);
    const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
    posts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return posts;
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
              if (post.authorId !== userId) {
                  const currentUser = await getUserProfile(userId);
                  const notification: Omit<Notification, 'id'> = {
                      userId: post.authorId,
                      type: 'POST_LIKE',
                      message: `${currentUser?.name || 'Someone'} liked your post.`,
                      link: postId,
                      causerId: userId,
                      causerName: currentUser?.name || 'Unknown',
                      timestamp: Timestamp.now(),
                      read: false,
                  };
                  await addDoc(notificationsCollection, notification);
              }
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
    const timestamp = Timestamp.now();
    await addDoc(commentsRef, { ...commentData, timestamp });
    await updateDoc(postRef, { commentCount: increment(1) });

    const postDoc = await getDoc(postRef);
    if(postDoc.exists()){
      const post = postDoc.data() as Post;
      if (post.authorId !== commentData.authorId) {
        const notification: Omit<Notification, 'id'> = {
          userId: post.authorId,
          type: 'POST_COMMENT',
          message: `${commentData.authorName} commented on your post.`,
          link: postId,
          causerId: commentData.authorId,
          causerName: commentData.authorName,
          timestamp,
          read: false,
        };
        await addDoc(notificationsCollection, notification);
      }
    }
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
  listenForFollowingPosts: (followingIds: string[], callback: (posts: Post[]) => void, onError: (error: Error) => void): () => void => {
    if (followingIds.length === 0) {
        callback([]);
        return () => {};
    }
    
    const allowedPostTypes: Post['type'][] = ['general', 'proposal', 'offer', 'opportunity'];
    // Securely query for public post types, then filter client-side for followed users.
    // This avoids complex queries that Firestore doesn't support well (e.g., multiple 'in' clauses)
    // and prevents permission errors by not requesting 'distress' posts.
    const q = query(postsCollection, where('type', 'in', allowedPostTypes), orderBy('date', 'desc'), limit(100));
    
    return onSnapshot(q, (snapshot) => {
        const allRecentPosts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        const followingIdsSet = new Set(followingIds);
        const followingPosts = allRecentPosts.filter(post => followingIdsSet.has(post.authorId));
        callback(followingPosts);
    }, (error) => {
        console.error(`Firestore listener error for following posts:`, error);
        onError(error);
    });
  },

  followUser: async (currentUserId: string, targetUserId: string): Promise<void> => {
    const batch = writeBatch(db);
    const currentUserRef = doc(db, 'users', currentUserId);
    batch.update(currentUserRef, { following: arrayUnion(targetUserId) });
    const targetUserRef = doc(db, 'users', targetUserId);
    batch.update(targetUserRef, { followers: arrayUnion(currentUserId) });
    
    const currentUserDoc = await getDoc(currentUserRef);
    if (currentUserDoc.exists()) {
      const causerName = currentUserDoc.data().name;
      const notification: Omit<Notification, 'id'> = {
        userId: targetUserId,
        type: 'NEW_FOLLOWER',
        message: `${causerName} started following you.`,
        link: currentUserId,
        causerId: currentUserId,
        causerName: causerName,
        timestamp: Timestamp.now(),
        read: false,
      };
      const notificationRef = doc(collection(db, 'notifications'));
      batch.set(notificationRef, notification);
    }
    
    await batch.commit();
  },

  unfollowUser: async (currentUserId: string, targetUserId: string): Promise<void> => {
    const batch = writeBatch(db);
    const currentUserRef = doc(db, 'users', currentUserId);
    batch.update(currentUserRef, { following: arrayRemove(targetUserId) });
    const targetUserRef = doc(db, 'users', targetUserId);
    batch.update(targetUserRef, { followers: arrayRemove(currentUserId) });
    await batch.commit();
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
        error => {
            console.error("Firestore listener error (reports):", error);
            onError(error);
        }
    );
  },

  resolvePostReport: async (reportId: string, postId: string, authorId: string): Promise<void> => {
    const batch = writeBatch(db);
    const reportRef = doc(db, 'reports', reportId);
    batch.update(reportRef, { status: 'resolved' });
    const postRef = doc(db, 'posts', postId);
    batch.delete(postRef);
    
    const userRef = doc(db, 'users', authorId);
    batch.update(userRef, { credibility_score: increment(-25) });
    
    await batch.commit();
  },
  
  dismissReport: async (reportId: string): Promise<void> => {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { status: 'resolved' });
  },

  // Chat
  getChatContacts: async (currentUser: User, forGroup: boolean = false): Promise<User[]> => {
    // Securely build user list from the members collection to avoid permission errors for non-admins.
    const membersSnapshot = await getDocs(query(membersCollection));
    const memberData = membersSnapshot.docs.map(doc => doc.data());

    const memberUids = memberData.map(m => m.uid).filter((uid): uid is string => !!uid);
    // FIX: Add type guard to ensure agentUids is string[]
    const agentUids = memberData.map(m => m.agent_id).filter((id): id is string => typeof id === 'string' && id !== 'PUBLIC_SIGNUP');
    
    const allUids = [...new Set([...memberUids, ...agentUids])];
    
    const allActiveUsers = await fetchUsersByUids(allUids);
    const usersWithoutCurrentUser = allActiveUsers.filter(user => user.id !== currentUser.id);

    if (currentUser.role !== 'admin') {
      // Members can only chat with other members for now to ensure security.
      return usersWithoutCurrentUser.filter(user => user.role === 'member' || user.role === 'admin');
    }

    return usersWithoutCurrentUser;
  },
  
  listenForConversations: (userId: string, callback: (convos: Conversation[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(conversationsCollection, where('members', 'array-contains', userId));
      return onSnapshot(q, (snapshot) => {
        const convos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
        convos.sort((a, b) => (b.lastMessageTimestamp?.toMillis() || 0) - (a.lastMessageTimestamp?.toMillis() || 0));
        callback(convos);
      }, (error) => {
          console.error("Firestore listener error (conversations):", error);
          onError(error);
      });
  },

  listenForMessages: (convoId: string, callback: (msgs: Message[]) => void): () => void => {
      const messagesRef = collection(db, 'conversations', convoId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));
      return onSnapshot(q, (snapshot) => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message))));
  },

  sendMessage: async (convoId: string, message: Omit<Message, 'id'|'timestamp'>, conversation: Conversation): Promise<void> => {
      const batch = writeBatch(db);
      const messagesRef = doc(collection(db, 'conversations', convoId, 'messages'));
      const timestamp = Timestamp.now();
      batch.set(messagesRef, { ...message, timestamp });

      const convoRef = doc(db, 'conversations', convoId);
      batch.update(convoRef, {
          lastMessage: message.text,
          lastMessageSenderId: message.senderId,
          lastMessageTimestamp: timestamp,
          readBy: [message.senderId]
      });
      
      const recipients = conversation.members.filter(id => id !== message.senderId);
      for (const recipientId of recipients) {
          const notificationRef = doc(collection(db, 'notifications'));
          const messageSnippet = message.text.length > 50 ? `${message.text.substring(0, 47)}...` : message.text;
          const notificationMessage = conversation.isGroup 
            ? `${message.senderName} in ${conversation.name}: "${messageSnippet}"`
            : `${message.senderName}: "${messageSnippet}"`;
          const notification: Omit<Notification, 'id'> = {
              userId: recipientId,
              type: 'NEW_MESSAGE',
              message: notificationMessage,
              link: convoId,
              causerId: message.senderId,
              causerName: message.senderName,
              timestamp,
              read: false,
          };
          batch.set(notificationRef, notification);
      }
      
      await batch.commit();
  },
  
  startChat: async (userId1: string, userId2: string, userName1: string, userName2: string): Promise<Conversation> => {
      const q = query(conversationsCollection, where('members', 'array-contains', userId1), where('isGroup', '==', false));
      const snapshot = await getDocs(q);

      const existingConvo = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Conversation))
        .find(convo => convo.members.includes(userId2) && convo.members.length === 2);

      if (existingConvo) {
          return existingConvo;
      }

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

      const notification: Omit<Notification, 'id'> = {
        userId: userId2,
        type: 'NEW_CHAT',
        message: `${userName1} started a conversation with you.`,
        link: convoId,
        causerId: userId1,
        causerName: userName1,
        timestamp: newConvoData.lastMessageTimestamp,
        read: false,
      };
      await addDoc(notificationsCollection, notification);

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
          lastMessageTimestamp: firestoreServerTimestamp(),
          readBy: []
      });
  },
  
  getGroupMembers: async (memberIds: string[]): Promise<MemberUser[]> => {
      if (memberIds.length === 0) return [];
      const users = await fetchUsersByUids(memberIds, { includeInactive: true });
      return users as MemberUser[];
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
  listenForNotifications: (userId: string, callback: (notifications: Notification[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(notificationsCollection, where('userId', '==', userId), limit(50));
      return onSnapshot(q, (snapshot) => {
        const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
        notifications.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
        callback(notifications);
      }, (error) => {
          console.error(`Firestore listener error for notifications (${userId}):`, error);
          onError(error);
      });
  },

  listenForActivity: (callback: (activities: Activity[]) => void, onError: (error: Error) => void): () => void => {
      const q = query(activityFeedCollection, orderBy('timestamp', 'desc'), limit(50));
      return onSnapshot(q, 
        (snapshot) => callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity))),
        (error) => {
            console.error("Firestore listener error (activity feed):", error);
            onError(error);
        }
      );
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
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { read: true });
    });
    await batch.commit();
  },
};