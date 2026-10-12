import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import AdminCustomers from './pages/admin/AdminCustomers';
import Account from './pages/Account';
import { CustomerAuthProvider } from './context/CustomerAuthContext';
import AdminBooks from './pages/admin/AdminBooks';
import AdminReviews from './pages/admin/AdminReviews';
import AdminStats from './pages/admin/AdminStats';
import AdminLayout from './pages/admin/AdminLayout';
import AdminLogin from './pages/admin/AdminLogin';
import AdminMenu from './pages/admin/AdminMenu';
import AdminOrders from './pages/admin/AdminOrders';
import PublicSite from './pages/PublicSite';

function App() {
  return (
    <AdminAuthProvider>
      <CustomerAuthProvider>
      <Routes>
        <Route path="/" element={<PublicSite />} />
        <Route path="/account" element={<Account />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="orders" replace />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="menu" element={<AdminMenu />} />
          <Route path="stats" element={<AdminStats />} />
          <Route path="books" element={<AdminBooks />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="reviews" element={<AdminReviews />} />
        </Route>
      </Routes>
      </CustomerAuthProvider>
    </AdminAuthProvider>
  );
}

export default App;
