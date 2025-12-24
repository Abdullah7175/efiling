export default function UnauthorizedPage() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="bg-white p-8 rounded shadow text-center">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
        <p>You do not have permission to view this page.</p>
      </div>
    </div>
  );
} 