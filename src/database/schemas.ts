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
      enum: ['OPEN', 'PAID', 'SYNCED', 'FAILED'] 
    },
    createdAt: { type: 'number' },
    customerName: { type: 'string' },
    orderType: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          productId: { type: 'string' },
          name: { type: 'string' },
          modifiers: { type: 'array' },
          lineTotal: { type: 'number' }
        }
      }
    },
    grossTotal: { type: 'number' }
  },
  required: ['ticketId', 'status', 'createdAt', 'grossTotal']
} as const;