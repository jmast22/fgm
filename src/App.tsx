import { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppLayout from './components/layout/AppLayout'
import { AnimatePresence } from 'framer-motion'
import PageTransition from './components/layout/PageTransition'
import { ErrorBoundary } from './components/common/ErrorBoundary'

// Lazy-loaded routes
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Login = lazy(() => import('./pages/Login'))
const SignUp = lazy(() => import('./pages/SignUp'))
const Profile = lazy(() => import('./pages/Profile'))
const AdminImport = lazy(() => import('./pages/AdminImport'))
const CreateLeague = lazy(() => import('./pages/CreateLeague'))
const JoinLeague = lazy(() => import('./pages/JoinLeague'))
const LeagueDashboard = lazy(() => import('./pages/LeagueDashboard'))
const DraftRoom = lazy(() => import('./pages/DraftRoom'))

// Loading Fallback Component
const RouteSkeleton = () => (
  <div className="w-full h-full flex items-center justify-center min-h-[50vh]">
    <div className="flex flex-col items-center gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-surface-700 border-t-primary-500 animate-spin"></div>
      <div className="text-surface-400 text-sm font-bold tracking-widest uppercase animate-pulse">Loading View...</div>
    </div>
  </div>
)

const AnimatedRoutes = () => {
    const location = useLocation()
    return (
        <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
                <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
                <Route path="/signup" element={<PageTransition><SignUp /></PageTransition>} />
                <Route element={<ProtectedRoute />}>
                    <Route path="/" element={<PageTransition><Dashboard /></PageTransition>} />
                    <Route path="/profile" element={<PageTransition><Profile /></PageTransition>} />
                    <Route path="/admin/import" element={<PageTransition><AdminImport /></PageTransition>} />
                    <Route path="/leagues/create" element={<PageTransition><CreateLeague /></PageTransition>} />
                    <Route path="/leagues/join" element={<PageTransition><JoinLeague /></PageTransition>} />
                    <Route path="/leagues/:id" element={<PageTransition><LeagueDashboard /></PageTransition>} />
                    <Route path="/drafts/:leagueId" element={<PageTransition><DraftRoom /></PageTransition>} />
                </Route>
            </Routes>
        </AnimatePresence>
    )
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppLayout>
          <ErrorBoundary>
            <Suspense fallback={<RouteSkeleton />}>
              <AnimatedRoutes />
            </Suspense>
          </ErrorBoundary>
        </AppLayout>
      </Router>
    </AuthProvider>
  )
}

export default App
