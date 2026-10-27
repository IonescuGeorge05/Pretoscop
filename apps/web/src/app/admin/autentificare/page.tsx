import { LoginForm } from './login-form';

export default function AdminLogin() {
  return (
    <div className="mx-auto max-w-sm px-4 py-20">
      <h1 className="text-xl font-bold">Pretoscop — admin</h1>
      <p className="mt-1 text-sm text-ink-soft">Primești un link de autentificare pe email (valabil 10 minute).</p>
      <LoginForm />
    </div>
  );
}
