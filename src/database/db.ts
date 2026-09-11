import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { menuSchema, ticketSchema } from './schemas';

if (import.meta.env.DEV) {
  addRxPlugin(RxDBDevModePlugin);
}

let dbPromise: any = null;

export const getDatabase = async () => {
  if (dbPromise) return dbPromise;

  const createDB = async () => {
    const db = await createRxDatabase({
      name: 'cafepos_v6', // Bumped to v6 for Reports/Cost Tracking
      storage: wrappedValidateAjvStorage({ storage: getRxStorageDexie() })
    });

    await db.addCollections({
      menu: { schema: menuSchema },
      tickets: { schema: ticketSchema }
    });

    const menuItems = await db.menu.find().exec();
    if (menuItems.length === 0) {
      await db.menu.bulkInsert([
        { 
          productId: 'prod_1', name: 'Latte', price: 4.50, cost: 1.20, category: 'Hot Coffee', image: '',
          modifierGroups: [{ groupId: 'mg_milk', name: 'Milk Options', options: [{ modId: 'mod_whole', name: 'Whole Milk', priceDelta: 0 }, { modId: 'mod_oat', name: 'Oat Milk (+৳0.50)', priceDelta: 0.50 }]}]
        },
        { productId: 'prod_2', name: 'Americano', price: 3.00, cost: 0.50, category: 'Hot Coffee', image: '', modifierGroups: [] },
        { productId: 'prod_3', name: 'Croissant', price: 3.75, cost: 1.00, category: 'Pastry', image: '', modifierGroups: [] }
      ]);
    }
    return db;
  };

  dbPromise = createDB();
  return dbPromise;
};