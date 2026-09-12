import { getDatabase } from '../database/db';
import { doc, setDoc } from 'firebase/firestore';
import { db as firebaseDB } from '../database/firebase';

let isSyncing = false;

export async function startContinuousSync() {
  // Check every 10 seconds automatically
  setInterval(async () => {
    if (isSyncing || !navigator.onLine) return; 
    
    isSyncing = true;
    try {
      const db = await getDatabase();
      // Find only tickets that are locally PAID but not yet in the cloud
      const pendingTickets = await db.tickets.find({ selector: { status: 'PAID' } }).exec();
      
      for (const ticketDoc of pendingTickets) {
        const ticketData = ticketDoc.toJSON();
        
        // 1. Write to Firebase FIRST (Using ticketId as the Cloud document ID to prevent duplicates)
        await setDoc(doc(firebaseDB, 'tickets', ticketData.ticketId), ticketData);
        
        // 2. Mark as SYNCED locally ONLY if the Firebase write succeeds
        await ticketDoc.incrementalPatch({ status: 'SYNCED' });
        console.log(`Successfully synced ticket: ${ticketData.ticketId}`);
      }
    } catch (error) {
      console.error('Background sync encountered an error, will retry...', error);
    } finally {
      isSyncing = false;
    }
  }, 10000);
}