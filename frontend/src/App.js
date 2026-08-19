import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './App.css';
import './statusUpdate.css';
import './statusBadges.css';
import './conversation.css';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Tickets from './pages/Tickets';
import NewTicket from './pages/NewTicket';
import TicketDetails from './pages/TicketDetails';

function App() {
  return <BrowserRouter><Navbar /><main className="page-shell"><Routes>
    <Route path="/login" element={<Login />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/tickets" element={<Tickets />} />
      <Route path="/tickets/:id" element={<TicketDetails />} />
      <Route element={<ProtectedRoute roles={['requester']} />}><Route path="/tickets/new" element={<NewTicket />} /></Route>
    </Route>
    <Route path="*" element={<Navigate to="/tickets" replace />} />
  </Routes></main></BrowserRouter>;
}
export default App;
