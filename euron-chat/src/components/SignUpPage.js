import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./SignUpPage.css";

const SignUpPage = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const handleSubmit = async (e) => {
  e.preventDefault();
  setError("");

  if (!name || !email || !password) {
    setError("Please fill all fields.");
    return;
  }

  if (!agree) {
    setError("You must agree to the Terms and Conditions.");
    return;
  }

  setLoading(true);

  try {
    const res = await fetch("http://localhost:8000/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    console.log("Signup status:", res.status);

    // ✅ FIX: accept ANY success status (200–299)
    if (res.ok) {
      navigate("/login");
      return;
    }

    // if we reach here -> backend returned error
    const errBody = await res.json().catch(() => null);

    const parseError = (body) => {
      if (!body) return "Signup failed.";

      if (Array.isArray(body.detail)) {
        return body.detail.map((i) => i.msg).join("; ");
      }

      if (typeof body.detail === "string") {
        return body.detail;
      }
      return "Something went wrong.";
    };

    setError(parseError(errBody));

  } catch (err) {
    console.error("Signup error:", err);
    setError("Network error. Is the backend running?");
  } finally {
    setLoading(false);
  }
};


  return (
    <div className="signup-page">
      <div className="signup-card">
        <h1 className="signup-title">Create an Account</h1>
        <p className="signup-subtitle">
          Join us today! Fill in the details below.
        </p>

        <form className="signup-form" onSubmit={handleSubmit}>
          {error && <div className="signup-error">{error}</div>}

          {/* Name */}
          <div className="form-field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              type="text"
              placeholder="Your full name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="form-field">
            <label htmlFor="email">Email ID</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Password */}
          <div className="form-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="Create a password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {/* Checkbox */}
          <div className="form-field checkbox-field">
            <input
              type="checkbox"
              id="terms"
              checked={agree}
              onChange={() => setAgree(!agree)}
              required
            />
            <label htmlFor="terms">
              I agree to the Terms and Conditions
            </label>
          </div>

          {/* Submit button */}
          <button type="submit" className="signup-btn" disabled={loading}>
            {loading ? "Creating account..." : "Sign Up"}
          </button>

          <p className="signup-footer">
            Already have an account? <a href="/login">Login</a>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignUpPage;
