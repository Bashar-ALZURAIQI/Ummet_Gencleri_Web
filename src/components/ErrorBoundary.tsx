import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; message?: string; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error) {
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="h-10 w-10 text-rose-500" />
          <h2 className="mt-3 text-lg font-bold text-navy-900">حدث خطأ غير متوقع في هذه الجزئية</h2>
          <p className="mt-1 max-w-md text-sm text-gray-500">
            يمكنك تحديث الصفحة لمتابعة استخدام الموقع. إذا استمرت المشكلة، يرجى التواصل مع الإدارة.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, message: undefined })}
            className="btn-primary mt-4"
          >
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
