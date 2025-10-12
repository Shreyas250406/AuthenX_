import { Bank, Asset, BeneficiaryUser } from '../types';

export const mockBanks: Bank[] = [
  {
    id: '1',
    name: 'State Bank of India',
    branch: 'Mumbai Central',
    branchManager: 'Rajesh Kumar',
    employees: [
      { id: 'e1', name: 'Amit Sharma', phone: '+91 98765 43210', bankId: '1' },
      { id: 'e2', name: 'Priya Patel', phone: '+91 98765 43211', bankId: '1' },
    ]
  },
  {
    id: '2',
    name: 'HDFC Bank',
    branch: 'Delhi South',
    branchManager: 'Sunita Verma',
    employees: [
      { id: 'e3', name: 'Vikram Singh', phone: '+91 98765 43212', bankId: '2' },
    ]
  },
  {
    id: '3',
    name: 'ICICI Bank',
    branch: 'Bangalore Tech Park',
    branchManager: 'Anil Reddy',
    employees: [
      { id: 'e4', name: 'Deepa Krishnan', phone: '+91 98765 43213', bankId: '3' },
      { id: 'e5', name: 'Rahul Gupta', phone: '+91 98765 43214', bankId: '3' },
    ]
  },
];

export const mockBeneficiaries: BeneficiaryUser[] = [
  {
    id: 'u1',
    name: 'Anjali Mehta',
    phone: '+91 98765 11111',
    assetsAllocated: ['House - Plot 42A', 'Tractor'],
  },
  {
    id: 'u2',
    name: 'Suresh Yadav',
    phone: '+91 98765 22222',
    assetsAllocated: ['Agricultural Land - 5 acres'],
  },
  {
    id: 'u3',
    name: 'Kavita Desai',
    phone: '+91 98765 33333',
    assetsAllocated: ['Apartment - Flat 101', 'Car'],
    images: ['https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400']
  },
];

export const mockAssets: Asset[] = [
  {
    id: 'a1',
    name: 'House - Plot 42A',
    userId: 'u1',
    status: 'pending',
  },
  {
    id: 'a2',
    name: 'Tractor',
    userId: 'u1',
    status: 'authenticated',
    imageUrl: 'https://images.unsplash.com/photo-1562916260-eb478b684986?w=400',
    verifiedAt: new Date('2025-09-15'),
  },
  {
    id: 'a3',
    name: 'Agricultural Land - 5 acres',
    userId: 'u2',
    status: 'non-verified',
    imageUrl: 'https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400',
    uploadedAt: new Date('2025-09-20'),
  },
];
