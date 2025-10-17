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
    Conversation, Message, Report, Notification, Activity
} from '../types';
import { generateAgentCode } from '../utils';
import { generateWelcomeMessage } from './geminiService';


const usersCollection = collection(db, 'users');
const membersCollection = collection(db, 'members');
const broadcastsCollection = collection(db, 'broadcasts');
const postsCollection = collection(db, 'posts');
const conversationsCollection = collection(db, 'conversations');
const reportsCollection = collection(db, 'reports');
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
    };
    await setDoc(doc(usersCollection, user.uid), newAgent);
    return newAgent;
  },

  memberSignup: async (memberData: NewPublicMemberData, password: string): Promise<void> => {
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
    } catch (dbError) {
        console.error("DB write failed after user creation:", dbError);
        // This error is critical. If the DB write fails, the user has an auth account
        // but no profile, effectively locking them out.
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
  getUserProfile, // Expose the function

  getSearchableUsers: async (): Promise<User[]> => {
      const q = query(usersCollection, where("status", "==", "active"));
      const querySnapshot = await getDocs(q);
      return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
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
    // Default welcome message in case the AI service is unavailable (e.g., offline).
    let welcome_message = `Welcome to the Ubuntium Global Commons, ${memberData.full_name}! We are thrilled to have you join the ${agent.circle} Circle. I am because we are.`;
    let needs_welcome_update = false;

    try {
      // This will fail gracefully if offline, and the default message will be used.
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
      ...(needs_welcome_update && { needs_welcome_update: true }) // Conditionally add the flag
    };

    // This operation is automatically queued by Firestore's offline persistence.
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
            // Sort client-side to avoid needing a composite index
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

      // Create a global activity feed item for the new member
      const activity: Omit<Activity, 'id'> = {
          type: 'NEW_MEMBER',
          message: `${member.full_name} from ${member.circle} has joined the commons!`,
          link: member.uid, // Link to their user profile
          causerId: member.uid,
          causerName: member.full_name,
          causerCircle: member.circle,
          timestamp: Timestamp.now(),
      };
      await addDoc(activityFeedCollection, activity);
  },

  rejectMember: async (member: Member): Promise<void> => {
      const batch = writeBatch(db);

      // 1. Update the member's status to 'rejected'
      const memberRef = doc(db, 'members', member.id);
      batch.update(memberRef, { payment_status: 'rejected' });

      // 2. If a user account exists, mark it as 'ousted'
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
    // Find members that were registered offline and need a welcome message.
    const q = query(membersCollection, where("needs_welcome_update", "==", true), limit(10)); // Limit to 10 to avoid excessive API calls at once.
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
        return 0;
    }

    const batch = writeBatch(db);
    let updateCount = 0;

    for (const memberDoc of snapshot.docs) {
        const member = { id: memberDoc.id, ...memberDoc.data() } as Member;
        try {
            // Try to generate the message now that we're likely online.
            const welcome_message = await generateWelcomeMessage(member.full_name, member.circle);
            const memberRef = doc(db, 'members', member.id);
            batch.update(memberRef, {
                welcome_message,
                needs_welcome_update: false
            });
            updateCount++;
        } catch (error) {
            console.error(`Failed to generate welcome message for synced member ${member.id}. Will retry later.`, error);
            // We leave the flag as true so it can be retried on the next online sync.
        }
    }

    if (updateCount > 0) {
        await batch.commit();
    }

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
  
  getMembersInCircle: async (circle: string): Promise<User[]> => {
      const q = query(
        usersCollection,
        where("circle", "==", circle),
        where("role", "==", "member"),
        where("status", "==", "active"),
        limit(50)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
  },
  
  listenForNewMembersInCircle: (circle: string, callback: (users: User[]) => void): () => void => {
    const q = query(
        usersCollection, 
        where("circle", "==", circle),
        where("role", "==", "member"),
        where("status", "==", "active"),
        limit(10)
    );
    return onSnapshot(q, (snapshot) => {
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
        callback(users);
    });
  },

  createPost: async (author: User, content: string, type: Post['type']): Promise<void> => {
      const newPost: Omit<Post, 'id'> = {
          authorId: author.id,
          authorName: author.name,
          authorCircle: author.circle || 'Unknown',
          content,
          date: new Date().toISOString(),
          upvotes: [],
          replies: [],
          type,
      };
      const postRef = await addDoc(postsCollection, newPost);

      // Create a global activity item for relevant post types
      let activityType: Activity['type'] | null = null;
      switch (type) {
        case 'proposal':
            activityType = 'NEW_POST_PROPOSAL';
            break;
        case 'opportunity':
            activityType = 'NEW_POST_OPPORTUNITY';
            break;
        case 'offer':
            activityType = 'NEW_POST_OFFER';
            break;
        case 'general':
            activityType = 'NEW_POST_GENERAL';
            break;
        // 'distress' posts do not create public activity
      }

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
      
      const newPost: Omit<Post, 'id'> = {
          authorId: userData.id,
          authorName: "Anonymous Member",
          authorCircle: userData.circle || 'Unknown',
          content,
          date: new Date().toISOString(),
          upvotes: [],
          replies: [],
          type: 'distress',
      };
      const postRef = await addDoc(postsCollection, newPost);

      await updateDoc(userRef, {
          distress_calls_available: userData.distress_calls_available - 1,
          last_distress_post_id: postRef.id
      });
      
      return await getUserProfile(currentUser.uid) as User;
  },

  listenForPosts: (filter: 'all' | 'proposal' | 'distress' | 'offer' | 'opportunity' | 'general', callback: (posts: Post[]) => void): () => void => {
    if (filter === 'all') {
        const q = query(postsCollection, where('type', 'in', ['general', 'proposal', 'offer', 'opportunity', 'distress']), orderBy('date', 'desc'), limit(50));
        return onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
            callback(posts);
        });
    } else {
        // For filtered queries, fetch by date and filter client-side.
        const q = query(postsCollection, orderBy('date', 'desc'), limit(200)); // Fetch more to find enough of a certain type
        return onSnapshot(q, (snapshot) => {
            const posts = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Post))
                .filter(post => post.type === filter)
                .slice(0, 50);
            callback(posts);
        });
    }
  },

  listenForPostsByAuthor: (authorId: string, callback: (posts: Post[]) => void): () => void => {
    const q = query(postsCollection, where("authorId", "==", authorId), orderBy('date', 'desc'), limit(50));
    return onSnapshot(q, (snapshot) => {
        const posts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
        callback(posts);
    });
  },

  getPostsByAuthor: async (authorId: string): Promise<Post[]> => {
    const q = query(postsCollection, where("authorId", "==", authorId), orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
  },

  upvotePost: async (postId: string, userId: string): Promise<void> => {
      const postRef = doc(db, 'posts', postId);
      const postDoc = await getDoc(postRef);
      if (postDoc.exists()) {
          const post = postDoc.data() as Post;
          const user = await getUserProfile(userId);
          if (!user) return;

          if (post.upvotes.includes(userId)) {
              await updateDoc(postRef, { upvotes: arrayRemove(userId) });
          } else {
              await updateDoc(postRef, { upvotes: arrayUnion(userId) });
              // Create a notification for the post author, if it's not the author themselves liking it
              if (post.authorId !== userId) {
                  const notification: Omit<Notification, 'id'> = {
                      userId: post.authorId,
                      type: 'POST_LIKE',
                      message: `${user.name} liked your post.`,
                      link: postId,
                      causerId: userId,
                      causerName: user.name,
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

      // 1. Delete the post
      const postRef = doc(db, 'posts', postId);
      batch.delete(postRef);

      // 2. Check if this was the user's last distress post and clear it if so
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
        snapshot => {
            const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
            callback(reports);
        },
        error => {
            console.error("Firestore listener error (reports):", error);
            onError(error);
        }
    );
  },

  resolvePostReport: async (reportId: string, postId: string, authorId: string): Promise<void> => {
    const batch = writeBatch(db);

    // 1. Mark report as resolved
    const reportRef = doc(db, 'reports', reportId);
    batch.update(reportRef, { status: 'resolved' });

    // 2. Delete the post
    const postRef = doc(db, 'posts', postId);
    batch.delete(postRef);

    // 3. Penalize the user
    const userRef = doc(db, 'users', authorId);
    batch.update(userRef, { credibility_score: increment(-25) });

    await batch.commit();

    // 4. Check if user should be ousted
    const updatedUserDoc = await getDoc(userRef);
    if (updatedUserDoc.exists()) {
        const userData = updatedUserDoc.data() as User;
        if ((userData.credibility_score || 0) <= 0) {
            await updateDoc(userRef, { status: 'ousted' });
        }
    }
  },
  
  dismissReport: async (reportId: string): Promise<void> => {
      const reportRef = doc(db, 'reports', reportId);
      await updateDoc(reportRef, { status: 'resolved' });
  },

  // Chat
  getChatContacts: async (currentUser: User, forGroup: boolean = false): Promise<User[]> => {
    // Admins can contact anyone for 1-on-1 or group chats.
    if (currentUser.role === 'admin') {
      const q = query(usersCollection, where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as User))
        .filter(user => user.id !== currentUser.id);
    }
    
    // Members and Agents
    if (currentUser.role === 'member' || currentUser.role === 'agent') {
      // For groups, allow adding any active user (members, agents, admins).
      if (forGroup) {
        const q = query(usersCollection, where('status', '==', 'active'));
        const snapshot = await getDocs(q);
        return snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as User))
          .filter(user => user.id !== currentUser.id);
      }
      
      // For 1-on-1 chats, they can contact active members and admins.
      const membersQuery = query(usersCollection, where('role', '==', 'member'), where('status', '==', 'active'));
      const adminsQuery = query(usersCollection, where('role', '==', 'admin'));
      
      const [membersSnap, adminsSnap] = await Promise.all([getDocs(membersQuery), getDocs(adminsQuery)]);
      
      const members = membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      const admins = adminsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      
      const combined = [...members, ...admins];
      // Deduplicate and filter out self.
      const uniqueUsers = Array.from(new Map(combined.map(item => [item.id, item])).values());
      return uniqueUsers.filter(user => user.id !== currentUser.id);
    }
    
    // Default empty for any other case (e.g., pending members).
    return [];
  },
  
  listenForConversations: (
    userId: string, 
    callback: (convos: Conversation[]) => void,
    onError: (error: Error) => void
  ): () => void => {
      const q = query(conversationsCollection, where('members', 'array-contains', userId));
      return onSnapshot(q, 
        (snapshot) => {
            const convos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conversation));
            convos.sort((a, b) => {
                const timeA = a.lastMessageTimestamp?.toDate().getTime() || 0;
                const timeB = b.lastMessageTimestamp?.toDate().getTime() || 0;
                return timeB - timeA;
            });
            callback(convos);
        },
        (error) => {
            console.error("Firestore listener error (conversations):", error);
            onError(error);
        }
      );
  },

  listenForMessages: (convoId: string, callback: (msgs: Message[]) => void): () => void => {
      const messagesRef = collection(db, 'conversations', convoId, 'messages');
      const q = query(messagesRef, orderBy('timestamp', 'asc'));
      return onSnapshot(q, (snapshot) => {
          const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
          callback(messages);
      });
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

      // Create notifications for other members in the chat
      const recipients = conversation.members.filter(id => id !== message.senderId);
      for (const recipientId of recipients) {
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
          await addDoc(notificationsCollection, notification);
      }
  },
  
  startChat: async (userId1: string, userId2: string, userName1: string, userName2: string): Promise<Conversation> => {
      // First, query for existing conversation to avoid permission errors on getDoc for non-existent doc
      const q = query(
          conversationsCollection,
          where('members', 'array-contains', userId1),
          where('isGroup', '==', false)
      );

      const snapshot = await getDocs(q);
      let existingConvo: Conversation | null = null;
      
      snapshot.forEach(doc => {
          const convo = { id: doc.id, ...doc.data() } as Conversation;
          // Since it's not a group chat, it must have 2 members.
          if (convo.members.includes(userId2) && convo.members.length === 2) {
              existingConvo = convo;
          }
      });

      if (existingConvo) {
          return existingConvo;
      }

      // If not found, create a new one
      const members = [userId1, userId2].sort();
      const convoId = members.join('_'); // Use deterministic ID for creation
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

      // Create a notification for the person being contacted
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
      return onSnapshot(q, (snapshot) => {
          const notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
          callback(notifications);
      });
  },

  listenForActivity: (callback: (activities: Activity[]) => void): () => void => {
      const q = query(activityFeedCollection, orderBy('timestamp', 'desc'), limit(50));
      return onSnapshot(q, (snapshot) => {
          const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity));
          callback(activities);
      });
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