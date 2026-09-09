// src/database/schemas.ts

export const menuSchema = {
  version: 0,
  primaryKey: 'productId',
  type: 'object',
  properties: {
    productId: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    price: { type: 'number' },
    category: { type: 'string' },
    modifierGroups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          groupId: { type: 'string' },
          name: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                modId: { type: 'string' },
                name: { type: 'string' },
                priceDelta: { type: 'number' }
              }
            }
          }
        }
      }
    }
  },
  required: ['productId', 'name', 'price', 'category']
} as const;

export const ticketSchema = {
  version: 0,
  primaryKey: 'ticketId',
  type: 'object',
  properties: {
    ticketId: { type: 'string', maxLength: 100 },
    status: { 
      type: 'string', 
      // OPEN = currently building, PAID = finished but not synced, SYNCED = uploaded to cloud
      enum: ['OPEN', 'PAID', 'SYNCED', 'FAILED'] 
    },
    createdAt: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          modifiers: { type: 'array' }, // Array of selected modifier objects
          lineTotal: { type: 'number' }
        }
      }
    },
    grossTotal: { type: 'number' }
  },
  required: ['ticketId', 'status', 'createdAt', 'grossTotal']
} as const;