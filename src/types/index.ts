export type UserRole = 'superadmin' | 'bankadmin' | 'user';

export interface User {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  bankId?: string;
}

export interface Bank {
  id: string;
  name: string;
  branch: string;
  branchManager: string;
  employees: Employee[];
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  bankId: string;
}

export interface Asset {
  id: string;
  name: string;
  userId: string;
  status: 'pending' | 'non-verified' | 'authenticated';
  imageUrl?: string;
  uploadedAt?: Date;
  verifiedAt?: Date;
}

export interface BeneficiaryUser {
  id: string;
  name: string;
  phone: string;
  assetsAllocated: string[];
  images?: string[];
}
