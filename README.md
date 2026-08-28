b# IT Support Ticket System

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
    ```

2. Install the root, backend and frontend dependencies:

   ```bash
   npm run install-all
   ```

3. Copy the example environment files:

   Windows PowerShell:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   Copy-Item frontend/.env.example frontend/.env
   ```

   macOS or Linux:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

4. Configure `backend/.env` with the required values:

   ```text
   PORT=5001
   MONGO_URI=your-mongodb-connection-string
   JWT_SECRET=your-secure-jwt-secret
   CLIENT_URL=http://localhost:3000
   ```

5. Confirm that `frontend/.env` contains:

   ```text
   REACT_APP_API_URL=http://localhost:5001/api
   ```

6. Start the backend and frontend:

   ```bash
   npm run dev
   ```

7. Open the local application:

   ```text
   http://localhost:3000
   ```

## Testing

Run the automated backend test suite:

```bash
npm test --prefix backend
```

The current test suite contains 36 passing backend tests.

Build the React frontend:

```bash
npm run build --prefix frontend
```

## Continuous Integration

GitHub Actions runs the backend tests and builds the frontend when changes are pushed to `main` or submitted through a pull request targeting `main`.

## Deployment

The sample application is deployed on AWS EC2.

- Public URL: [http://54.66.57.124](http://54.66.57.124)
- Instance ID: `i-0c6b38d1157d37051`

The public URL is available while the assigned EC2 instance is running.

## Known Limitations

- User registration is outside the selected project scope.
- Forgot Password is not included in the implemented workflow.
- User, IT Manager and Support Agent accounts must exist before login.
- The implemented workflow uses the four defined ticket statuses only.
- The student EC2 deployment uses HTTP rather than HTTPS.

## Security Notes

Environment files, MongoDB credentials and JWT secrets must not be committed to the repository. Safe example configuration files are provided for local setup.

## Author

Mohammed Almutairi

Student ID: n12326551
