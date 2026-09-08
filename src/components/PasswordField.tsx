import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff } from 'lucide-react';
import {
  passwordVisibilityPresentation,
  togglePasswordVisibility,
} from '../domain/passwordVisibility';

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  leadingIcon?: ReactNode;
  wrapperClassName?: string;
}

export default function PasswordField({
  leadingIcon,
  wrapperClassName = '',
  className = '',
  ...inputProps
}: PasswordFieldProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const presentation = passwordVisibilityPresentation(visible);
  const actionLabel = visible
    ? t('auth.hidePassword', presentation.actionLabel)
    : t('auth.showPassword', presentation.actionLabel);

  return (
    <div className={`relative ${wrapperClassName}`}>
      {leadingIcon}
      <input
        {...inputProps}
        type={presentation.inputType}
        className={`${className} pl-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => togglePasswordVisibility(current))}
        className="absolute left-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-navy-700 focus:outline-none focus:ring-2 focus:ring-navy-300"
        aria-label={actionLabel}
        title={actionLabel}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
