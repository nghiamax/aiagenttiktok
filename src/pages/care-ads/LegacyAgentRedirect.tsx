import { Navigate, useLocation } from 'react-router-dom';

/** /ads/agent?view=… (link / bookmark cũ) → /care-ads/product?view=… */
export default function LegacyAgentRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/care-ads/product', search, hash }} replace />;
}
