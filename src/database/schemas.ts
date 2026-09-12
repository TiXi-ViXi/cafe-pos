export const menuSchema = {
  version: 0,
  primaryKey: 'productId',
  type: 'object',
  properties: {
    productId: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
    price: { type: 'number' },
    cost: { type: 'number' },
    category: { type: 'string' },
    image: { type: 'string' },
    modifierGroups: { type: 'array', items: { type: 'object', properties: { groupId: { type: 'string' }, name: { type: 'string' }, options: { type: 'array', items: { type: 'object', properties: { modId: { type: 'string' }, name: { type: 'string' }, priceDelta: { type: 'number' } } } } } } }
  },
  required: ['productId', 'name', 'price', 'category']
} as const;

export const ticketSchema = {
  version: 0,
  primaryKey: 'ticketId',
  type: 'object',
  properties: {
    ticketId: { type: 'string', maxLength: 100 },
    status: { type: 'string', enum: ['OPEN', 'PAID', 'SYNCED', 'FAILED'] },
    createdAt: { type: 'number' },
    customerName: { type: 'string' },
    cashierId: { type: 'string' },
    cashierName: { type: 'string' },
    waiterName: { type: 'string' },
    orderType: { type: 'string' },
    tableNumber: { type: 'string' },
    paymentMethod: { type: ['string', 'null'] }, // NEW: Added paymentMethod to schema
    items: { type: 'array', items: { type: 'object', properties: { productId: { type: 'string' }, name: { type: 'string' }, modifiers: { type: 'array' }, lineTotal: { type: 'number' }, cost: { type: 'number' } } } },
    grossTotal: { type: 'number' },
    totalCost: { type: 'number' }
  },
  required: ['ticketId', 'status', 'createdAt', 'grossTotal', 'cashierId', 'cashierName']
} as const;

export const userSchema = {
  version: 0,
  primaryKey: 'userId',
  type: 'object',
  properties: {
    userId: { type: 'string', maxLength: 100 },
    username: { type: 'string' },
    pin: { type: 'string' },
    role: { type: 'string', enum: ['admin', 'employee'] }
  },
  required: ['userId', 'username', 'pin', 'role']
} as const;