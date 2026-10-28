import { AdminModuleId, PermissionKey, UserRole } from '../types/domain';

export interface RoleDefinition {
  role: UserRole;
  label: string;
  shortDescription: string;
  permissions: PermissionKey[];
}

export const ROLE_DEFINITIONS: Record<UserRole, RoleDefinition> = {
  super_admin: {
    role: 'super_admin',
    label: 'Superadministrador',
    shortDescription: 'Controlo total sobre operações, configurações críticas, utilizadores e permissões.',
    permissions: [
      'dashboard:view',
      'products:view',
      'products:write',
      'categories:view',
      'categories:write',
      'orders:view',
      'orders:write',
      'customers:view',
      'customers:view_contact_pii',
      'customers:write',
      'crm:view',
      'crm:write',
      'marketing:view',
      'marketing:write',
      'reports:view',
      'reports:export',
      'users:view',
      'users:manage',
      'settings:view',
      'settings:write',
    ],
  },
  admin: {
    role: 'admin',
    label: 'Administrador',
    shortDescription: 'Gestão completa da operação diária, catálogo, encomendas, CRM, marketing e configurações.',
    permissions: [
      'dashboard:view',
      'products:view',
      'products:write',
      'categories:view',
      'categories:write',
      'orders:view',
      'orders:write',
      'customers:view',
      'customers:view_contact_pii',
      'customers:write',
      'crm:view',
      'crm:write',
      'marketing:view',
      'marketing:write',
      'reports:view',
      'reports:export',
      'users:view',
      'settings:view',
      'settings:write',
    ],
  },
  product_manager: {
    role: 'product_manager',
    label: 'Gestor de produtos',
    shortDescription: 'Administração de produtos, preços em Kz, stock, media e categorias do catálogo.',
    permissions: [
      'dashboard:view',
      'products:view',
      'products:write',
      'categories:view',
      'categories:write',
      'reports:view',
    ],
  },
  order_manager: {
    role: 'order_manager',
    label: 'Gestor de encomendas',
    shortDescription: 'Acompanhamento de encomendas, confirmação de atendimento WhatsApp e expedição.',
    permissions: [
      'dashboard:view',
      'products:view',
      'orders:view',
      'orders:write',
      'customers:view',
      'customers:view_contact_pii',
      'reports:view',
    ],
  },
  marketing_manager: {
    role: 'marketing_manager',
    label: 'Gestor de marketing',
    shortDescription: 'Configuração do Meta Pixel, eventos da loja, privacidade e consulta de relatórios.',
    permissions: [
      'dashboard:view',
      'products:view',
      'marketing:view',
      'marketing:write',
      'reports:view',
      'reports:export',
    ],
  },
  crm_agent: {
    role: 'crm_agent',
    label: 'Atendimento/CRM',
    shortDescription: 'Gestão de contactos, acompanhamento comercial, etiquetas, notas e encomendas.',
    permissions: [
      'dashboard:view',
      'orders:view',
      'orders:write',
      'customers:view',
      'customers:view_contact_pii',
      'customers:write',
      'crm:view',
      'crm:write',
    ],
  },
};

const MODULE_REQUIRED_PERMISSION: Record<AdminModuleId, PermissionKey | null> = {
  dashboard: 'dashboard:view',
  products: 'products:view',
  categories: 'categories:view',
  orders: 'orders:view',
  customers: 'customers:view',
  crm: 'crm:view',
  marketing: 'marketing:view',
  reports: 'reports:view',
  users: 'users:view',
  settings: 'settings:view',
  help: null,
};

export function hasPermission(role: UserRole, permission: PermissionKey): boolean {
  const def = ROLE_DEFINITIONS[role];
  if (!def) return false;
  return def.permissions.includes(permission);
}

export function canAccessModule(role: UserRole, moduleId: AdminModuleId): boolean {
  const required = MODULE_REQUIRED_PERMISSION[moduleId];
  if (!required) return true;
  return hasPermission(role, required);
}

export function getRoleLabel(role: UserRole): string {
  return ROLE_DEFINITIONS[role]?.label ?? role;
}
