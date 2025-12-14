import React from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./LoginPage.css";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      console.log("inside the login js")
      const res = await fetch("http://localhost:8000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        // Ensure loading is cleared before returning
        setLoading(false);
        if (res.status === 401) {
          setError("Invalid email or password.");
        } else {
          const text = await res.text().catch(() => null);
          setError("Server error. " + (text || `Status ${res.status}`));
        }
        return;
      }

      const data = await res.json();

      // Expect backend to return { access_token, token_type, user_id }
      if (!data.access_token) {
        setError("Login succeeded but no token was returned by the server.");
        setLoading(false);
        return;
      }

      // store access token and user id
      localStorage.setItem("access_token", data.access_token);
      if (data.user_id !== undefined && data.user_id !== null) {
        localStorage.setItem("user_id", data.user_id);
      }

      // Optional: verify token by calling a protected endpoint (/me)
      try {
        const meRes = await fetch("http://localhost:8000/me", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${data.access_token}`,
          },
        });

        if (!meRes.ok) {
          // token likely invalid/expired — clear stored token and show error
          localStorage.removeItem("access_token");
          localStorage.removeItem("user_id");
          setError("Failed to verify token with the server. Please try logging in again.");
          setLoading(false);
          return;
        }

        // optionally read returned user info if you want to confirm or store additional data
        // const meData = await meRes.json();
      } catch (verifyErr) {
        // network or other problem during verification
        console.error("Token verification request failed:", verifyErr);
        // Not fatal: remove token to avoid storing an unusable token
        localStorage.removeItem("access_token");
        localStorage.removeItem("user_id");
        setError("Network error verifying login. Please try again.");
        setLoading(false);
        return;
      }

      // navigate to chat/dashboard
      setLoading(false);
      navigate("/chat");
    } catch (err) {
      console.error("Login request failed:", err);
      setError("Network error. Is the backend running?");
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">Login</h1>
        <p className="login-subtitle">Welcome back! Please enter your details.</p>

        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="login-error">{error}</div>}
          <div className="form-field">
            <label htmlFor="email">Email ID</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>

          <p className="login-footer">
            Don’t have an account? <a href="/signup">Sign up</a>
          </p>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
