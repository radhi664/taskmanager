# IT Support Ticket System

The IT Support Ticket System is an individual IFN636 project that supports the submission, assignment, processing and resolution of IT support requests. The application provides authenticated and role-based access for Users, IT Managers and Support Agents.

## Main Workflows

1. A User logs in, submits a support request, tracks its status and responds when additional information is requested.
2. An IT Manager reviews and assigns the request, after which a Support Agent updates its priority and status, communicates with the User and records a resolution summary.

## Key Features

- JWT authentication and role-based access control.
- Ticket submission with input validation and persistent storage.
- Authorised ticket viewing based on the authenticated role.
- Ticket assignment by the IT Manager.
- Priority and status updates by the Support Agent.
- Open, In Progress, Waiting for User and Resolved statuses.
- Agent notes and User responses when additional information is required.
- Resolution summary validation before a ticket can be resolved.
- Attachment handling.
- Automated backend testing and GitHub Actions continuous integration.

## Architecture

The application uses a React frontend that communicates with a Node.js and Express REST API through Axios. The backend uses Mongoose to store and retrieve persistent ticket and user data from MongoDB. JWT authentication middleware protects the API and applies role-based permissions.

## Prerequisites

- Node.js
- npm
- Git
- MongoDB, either locally or through MongoDB Atlas

## Local Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/radhi664/taskmanager.git
   cd taskmanager