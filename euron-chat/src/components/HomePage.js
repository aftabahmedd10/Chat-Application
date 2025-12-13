import React from "react";
import { Link } from "react-router-dom";
import "./HomePage.css";

const HomePage = () => {
  return (
    <div className="home-page">
      <div className="home-card">
        <h1 className="home-title">Welcome</h1>
        <p className="home-subtitle">Login or sign up to continue.</p>

        <div className="button-row">
         

           <Link to="/login" className="ui animated button primary" tabIndex={0}>
            <div className="visible content">Login</div>
            <div className="hidden content">
              <i className="right arrow icon"></i>
            </div>
          </Link>

       
           <Link
            to="/signup"
            className="ui animated fade button ghost"
            tabIndex={0}>
            <div className="visible content">Sign-up</div>
            <div className="hidden content">Jump in</div>
          </Link>

        </div>
      </div>
    </div>
  );
};

export default HomePage;