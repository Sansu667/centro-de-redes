export type Rol = 'admin' | 'aprobador' | 'editor' | 'lector';

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: 'Administrador',
  aprobador: 'Aprobador',
  editor: 'Editor',
  lector: 'Solo lectura',
};

export const DESCRIPCION_ROL: Record<Rol, string> = {
  admin: 'Todo: usuarios, cuentas de redes, ajustes, aprobar y publicar.',
  aprobador: 'Aprueba o rechaza publicaciones, responde comentarios y ve estadísticas.',
  editor: 'Prepara publicaciones y las envía a revisión; responde comentarios.',
  lector: 'Ve estadísticas y comentarios, sin cambiar nada.',
};

export type Permiso =
  | 'ver'
  | 'crear_publicacion'
  | 'aprobar'
  | 'moderar_comentarios'
  | 'sincronizar'
  | 'gestionar_cuentas'
  | 'gestionar_usuarios'
  | 'ver_bitacora'
  | 'gestionar_ajustes';

const MATRIZ: Record<Rol, Permiso[]> = {
  admin: [
    'ver', 'crear_publicacion', 'aprobar', 'moderar_comentarios', 'sincronizar',
    'gestionar_cuentas', 'gestionar_usuarios', 'ver_bitacora', 'gestionar_ajustes',
  ],
  aprobador: ['ver', 'crear_publicacion', 'aprobar', 'moderar_comentarios', 'sincronizar', 'ver_bitacora'],
  editor: ['ver', 'crear_publicacion', 'moderar_comentarios'],
  lector: ['ver'],
};

export function puede(rol: Rol, permiso: Permiso): boolean {
  return MATRIZ[rol]?.includes(permiso) ?? false;
}
