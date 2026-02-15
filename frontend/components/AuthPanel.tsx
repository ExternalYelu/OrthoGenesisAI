"use client";

import { useState } from "react";
import { login, register } from "@/lib/api";
import { setToken, clearToken, getToken } from "@/lib/auth";
import { Button } from "./Button";

export function AuthPanel() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("doctor");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [currentToken, setCurrentToken] = useState<string | null>(getToken());

  const handleLogin = async () => {
    try {
      setStatus("loading");
      const response = await login(email, password);
      setToken(response.access_token);
      setCurrentToken(response.access_token);
      setMessage("Logged in successfully.");
      setStatus("done");
    } catch (error) {
      setStatus("error");
      setMessage("Login failed. Check credentials.");
    }
  };

  const handleRegister = async () => {
    try {
      setStatus("loading");
      await register({ email, full_name: fullName, password, role });
      setMessage("Registration complete. Please log in.");
      setStatus("done");
      setMode("login");
    } catch (error) {
      setStatus("error");
      setMessage("Registration failed. Try another email.");
    }
  };

  const handleLogout = () => {
    clearToken();
    setCurrentToken(null);
    setMessage("Session cleared.");
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <button
          className={`text-xs font-semibold uppercase tracking-[0.3em] ${
            mode === "login" ? "text-ink" : "text-slate/50"
          }`}
          onClick={() => setMode("login")}
        >
          Sign In
        </button>
        <button
          className={`text-xs font-semibold uppercase tracking-[0.3em] ${
            mode === "register" ? "text-ink" : "text-slate/50"
          }`}
          onClick={() => setMode("register")}
        >
          Register
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Email</p>
          <input
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Password</p>
          <input
            className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
      </div>

      {mode === "register" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Full name</p>
            <input
              className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </div>
          <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Role</p>
            <select
              className="mt-2 w-full rounded-xl border border-slate/20 px-3 py-2 text-sm"
              value={role}
              onChange={(event) => setRole(event.target.value)}
            >
              <option value="doctor">Doctor</option>
              <option value="researcher">Researcher</option>
              <option value="admin">Admin</option>
              <option value="patient">Patient</option>
            </select>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className={`text-xs ${status === "error" ? "text-red-600" : "text-slate"}`}>
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        {mode === "login" ? (
          <Button
            label={status === "loading" ? "Signing in..." : "Sign In"}
            onClick={handleLogin}
          />
        ) : (
          <Button
            label={status === "loading" ? "Registering..." : "Register"}
            onClick={handleRegister}
          />
        )}
        {currentToken ? (
          <button className="text-xs font-semibold text-accent" onClick={handleLogout}>
            Clear session
          </button>
        ) : null}
      </div>

      {currentToken ? (
        <div className="rounded-2xl border border-slate/10 bg-white/80 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-slate/50">Active token</p>
          <p className="mt-2 break-all text-xs text-slate">{currentToken}</p>
        </div>
      ) : null}
    </div>
  );
}
