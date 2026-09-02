export interface SidebarDrawerState {
  open: boolean;
}

export const toggleSidebar = (state: SidebarDrawerState): SidebarDrawerState => ({
  open: !state.open,
});

export const closeSidebar = (_state?: SidebarDrawerState): SidebarDrawerState => ({
  open: false,
});

export const shouldCloseSidebarForKey = (key: string): boolean => key === 'Escape';
