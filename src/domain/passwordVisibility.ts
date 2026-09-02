export interface PasswordVisibilityPresentation {
  inputType: 'password' | 'text';
  actionLabel: string;
}

export function passwordVisibilityPresentation(visible: boolean): PasswordVisibilityPresentation {
  return visible
    ? { inputType: 'text', actionLabel: 'إخفاء كلمة المرور' }
    : { inputType: 'password', actionLabel: 'إظهار كلمة المرور' };
}

export const togglePasswordVisibility = (visible: boolean): boolean => !visible;

