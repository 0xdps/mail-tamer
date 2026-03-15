import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './Layout'
import Login from './pages/Login'
import Rules from './pages/Rules'
import Decisions from './pages/Decisions'
import RunHistory from './pages/RunHistory'
import ControlPanel from './pages/ControlPanel'
import Emails from './pages/Emails'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/rules" replace />} />
          <Route path="rules" element={<Rules />} />
          <Route path="decisions" element={<Decisions />} />
          <Route path="runs" element={<RunHistory />} />
          <Route path="emails" element={<Emails />} />
          <Route path="control" element={<ControlPanel />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
