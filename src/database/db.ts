// src/database/db.ts
import { createRxDatabase, addRxPlugin, removeRxDatabase } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { menuSchema, ticketSchema } from './schemas';

// Enable RxDB dev mode for helpful error messages during development
if (import.meta.env.DEV) {
  addRxPlugin(RxDBDevModePlugin);
}

let dbPromise: any = null;

export const getDatabase = async () => {
  if (dbPromise) return dbPromise;

  const createDB = async () => {
    const db = await createRxDatabase({
      name: 'cafeposdb',
      // Wrap the local storage engine with the strict schema validator
      storage: wrappedValidateAjvStorage({
        storage: getRxStorageDexie()
      })
    });

    await db.addCollections({
      menu: { schema: menuSchema },
      tickets: { schema: ticketSchema }
    });

    // Seed the database with dummy menu items if it's empty
    const menuItems = await db.menu.find().exec();
    if (menuItems.length === 0) {
      await db.menu.bulkInsert([
        { 
          productId: 'prod_1', name: 'Latte', price: 4.50, category: 'Hot Coffee',
          modifierGroups: [
            {
              groupId: 'mg_milk', name: 'Milk Options',
              options: [
                { modId: 'mod_whole', name: 'Whole Milk', priceDelta: 0 },
                { modId: 'mod_oat', name: 'Oat Milk (+৳0.50)', priceDelta: 0.50 }
              ]
            }
          ]
        },
        { productId: 'prod_2', name: 'Americano', price: 3.00, category: 'Hot Coffee', modifierGroups: [] },
        { productId: 'prod_3', name: 'Croissant', price: 3.75, category: 'Pastry', modifierGroups: [] }
      ]);
    }

    return db;
  };

  dbPromise = createDB();
  return dbPromise;
};