import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import Profile from './pages/Profile'
import AdminImport from './pages/AdminImport'
import CreateLeague from './pages/CreateLeague'
import JoinLeague from './pages/JoinLeague'
import LeagueDashboard from './pages/LeagueDashboard'
import DraftRoom from './pages/DraftRoom'

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppLayout>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/admin/import" element={<AdminImport />} />
              <Route path="/leagues/create" element={<CreateLeague />} />
              <Route path="/leagues/join" element={<JoinLeague />} />
              <Route path="/leagues/:id" element={<LeagueDashboard />} />
              <Route path="/drafts/:leagueId" element={<DraftRoom />} />
            </Route>
          </Routes>
        </AppLayout>
      </Router>
    </AuthProvider>
  )
}

export default App
