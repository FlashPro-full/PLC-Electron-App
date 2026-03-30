import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { EyeOff, Eye, LogIn } from "lucide-react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import PureScanLogo from "../assets/PureScanLogo.png";

export function LoginPage() {
  const navigate = useNavigate();

  const [credential, setCredential] = useState<{ email: string; password: string }>({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCredential = async () => {
      try {
        const res = await axios.get("/api/purescan");
        if (res.data.result) {
          setCredential(res.data.credential)
        }
      } catch (err: any) {
        setError(err.response.data.error || 'Sign in failed. Please try again.');
      }
    };
    fetchCredential();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError(null);
    
    if (!credential.email.trim() || !credential.password.trim()) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post("/api/purescan", credential);
      if (res.data.result) {
        navigate("/device");
      }
    } catch (err: any) {
      setError(err.response.data.error || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCredential({ ...credential, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-20 h-72 w-72 rounded-full bg-red-200/30 blur-3xl" />
        <div className="absolute top-24 -left-24 h-64 w-64 rounded-full bg-red-100/40 blur-3xl" />
        <div className="absolute -bottom-24 right-10 h-56 w-56 rounded-full bg-red-300/20 blur-3xl" />
      </div>
      
      <div className="w-full max-w-md relative">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-red-400 via-red-500 to-red-600" />
          
          <div className="p-8">
            <div className="flex items-center justify-center gap-3 mb-8">
              <img src={PureScanLogo} alt="PureScan logo" className="w-10 h-10 object-contain" />
              <h1 className="text-2xl font-bold text-gray-900">PureScan Credential</h1>
            </div>

            {error && (
              <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={credential.email}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
                  placeholder="Enter your email"
                  disabled={loading}
                  required
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    name="password"
                    value={credential.password}
                    onChange={handleInputChange}
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors pr-12"
                    placeholder="Enter your password"
                    disabled={loading}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    disabled={loading}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500 text-white font-medium rounded-lg hover:bg-red-600 hover:shadow-lg active:bg-red-700 active:shadow-md focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-150 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:hover:shadow-none"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Logging in...
                  </>
                ) : (
                  <>
                    <LogIn className="w-5 h-5" />
                    Login
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="bg-gray-50 px-8 py-4 border-t border-gray-100">
            <p className="text-xs text-gray-500 text-center">
              © {new Date().getFullYear()} PureScan. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
