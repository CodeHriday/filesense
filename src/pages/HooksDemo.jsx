import React, { useState } from 'react';
import { 
  useForm, 
  usePagination, 
  useSearch, 
  useSorting,
  useLocalStorage,
  useWindowSize,
  useNotifications
} from '../hooks';
import './HooksDemo.css';

// Sample data for demonstration
const sampleData = Array.from({ length: 50 }, (_, index) => ({
  id: index + 1,
  name: `Item ${index + 1}`,
  category: ['Electronics', 'Clothing', 'Books', 'Home', 'Food'][Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 5)],
  price: Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 1000) + 10,
  stock: Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 100),
  rating: ((crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 5).toFixed(1),
  createdAt: new Date(Date.now() - (crypto.getRandomValues(new Uint32Array(1))[0] / 0xFFFFFFFF) * 10000000000)
}));

const HooksDemo = () => {
  // Example of using useLocalStorage for persistent preferences
  const [theme, setTheme] = useLocalStorage('demo-theme', 'light');
  
  // Example of using useNotifications for displaying notifications
  const { notify } = useNotifications();
  
  // Example of using useForm for form handling
  const { 
    values, 
    handleChange, 
    handleSubmit,
    errors,
    resetForm
  } = useForm(
    { name: '', email: '', message: '' },
    (formData) => {
      alert(`Form submitted with: ${JSON.stringify(formData)}`);
      resetForm();
    },
    (formData) => {
      const newErrors = {};
      if (!formData.name) newErrors.name = 'Name is required';
      if (!formData.email) newErrors.email = 'Email is required';
      if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
        newErrors.email = 'Email is invalid';
      }
      return newErrors;
    }
  );
  
  // Example of using useSearch for filtering
  const {
    searchQuery,
    handleSearchChange,
    filters,
    handleFilterChange,
    resetFilters,
    filteredData
  } = useSearch({
    data: sampleData,
    searchFields: ['name', 'category'],
    initialFilters: { category: '' }
  });
  
  // Example of using useSorting for sorting
  const {
    sortField,
    sortDirection,
    handleSortByField,
    sortedData
  } = useSorting({
    data: filteredData,
    defaultSortField: 'name',
    defaultSortDirection: 'asc'
  });
  
  // Example of using usePagination for pagination
  const {
    currentPage,
    itemsPerPage,
    currentItems,
    totalPages,
    nextPage,
    prevPage,
    goToPage,
    changeItemsPerPage,
    pageRange
  } = usePagination({
    data: sortedData,
    pageSize: 5
  });
  
  // Example of using useWindowSize for responsive design
  const { 
    width, 
    height,
    isSmall,
    isMedium,
    isLarge
  } = useWindowSize();
  
  // Get category options for filter
  const categoryOptions = [...new Set(sampleData.map(item => item.category))];
  
  return (
    <div className={`hooks-demo ${theme}`} style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Custom Hooks Demo</h1>
      
      <div className="demo-section" style={{ marginBottom: '30px' }}>
        <h2>Theme Preference (useLocalStorage)</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setTheme('light')}
            className={theme === 'light' ? 'active' : ''}
          >
            Light Theme
          </button>
          <button 
            onClick={() => setTheme('dark')}
            className={theme === 'dark' ? 'active' : ''}
          >
            Dark Theme
          </button>
        </div>
        <p>Theme preference is stored in localStorage and persists across refreshes.</p>
      </div>
      
      <div className="demo-section" style={{ marginBottom: '30px' }}>
        <h2>Notifications (useNotifications)</h2>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => notify.success('Operation completed successfully!')}>
            Success Notification
          </button>
          <button onClick={() => notify.error('An error occurred. Please try again.')}>
            Error Notification
          </button>
          <button onClick={() => notify.warning('This action cannot be undone.')}>
            Warning Notification
          </button>
          <button onClick={() => notify.info('New features are available.')}>
            Info Notification
          </button>
        </div>
        <p style={{ marginTop: '10px' }}>
          Click the buttons above to see different types of notifications.
        </p>
      </div>
      
      <div className="demo-section" style={{ marginBottom: '30px' }}>
        <h2>Window Size (useWindowSize)</h2>
        <p>Current window dimensions: {width} x {height}</p>
        <p>
          Breakpoint: {' '}
          {isSmall ? 'Small' : isMedium ? 'Medium' : isLarge ? 'Large' : 'Extra Large'}
        </p>
      </div>
      
      <div className="demo-section" style={{ marginBottom: '30px' }}>
        <h2>Form Handling (useForm)</h2>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '400px' }}>
          <div>
            <label>
              Name:
              <input
                type="text"
                name="name"
                value={values.name}
                onChange={handleChange}
              />
            </label>
            {errors.name && <div className="error">{errors.name}</div>}
          </div>
          
          <div>
            <label>
              Email:
              <input
                type="email"
                name="email"
                value={values.email}
                onChange={handleChange}
              />
            </label>
            {errors.email && <div className="error">{errors.email}</div>}
          </div>
          
          <div>
            <label>
              Message:
              <textarea
                name="message"
                value={values.message}
                onChange={handleChange}
                rows="4"
              />
            </label>
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="submit">Submit</button>
            <button type="button" onClick={resetForm}>Reset</button>
          </div>
        </form>
      </div>
      
      <div className="demo-section" style={{ marginBottom: '30px' }}>
        <h2>Data Management (useSearch, useSorting, usePagination)</h2>
        
        <div style={{ marginBottom: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={handleSearchChange}
              style={{ padding: '8px', width: '200px' }}
            />
          </div>
          
          <div>
            <select 
              value={filters.category} 
              onChange={(e) => handleFilterChange('category', e.target.value)}
              style={{ padding: '8px', width: '150px' }}
            >
              <option value="">All Categories</option>
              {categoryOptions.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          
          <button onClick={resetFilters}>Reset Filters</button>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th onClick={() => handleSortByField('id')} style={{ cursor: 'pointer' }}>
                  ID {sortField === 'id' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSortByField('name')} style={{ cursor: 'pointer' }}>
                  Name {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSortByField('category')} style={{ cursor: 'pointer' }}>
                  Category {sortField === 'category' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSortByField('price')} style={{ cursor: 'pointer' }}>
                  Price {sortField === 'price' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSortByField('stock')} style={{ cursor: 'pointer' }}>
                  Stock {sortField === 'stock' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th onClick={() => handleSortByField('rating')} style={{ cursor: 'pointer' }}>
                  Rating {sortField === 'rating' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {currentItems.map(item => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{item.name}</td>
                  <td>{item.category}</td>
                  <td>${item.price}</td>
                  <td>{item.stock}</td>
                  <td>{item.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredData.length === 0 && (
          <div style={{ padding: '20px', textAlign: 'center' }}>
            No items found matching your criteria.
          </div>
        )}
        
        <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <select
              value={itemsPerPage}
              onChange={(e) => changeItemsPerPage(Number(e.target.value))}
              style={{ padding: '5px' }}
            >
              <option value={5}>5 per page</option>
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
            </select>
            <span style={{ marginLeft: '10px' }}>
              Showing {Math.min(filteredData.length, 1 + (currentPage - 1) * itemsPerPage)}-
              {Math.min(filteredData.length, currentPage * itemsPerPage)} of {filteredData.length} items
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '5px' }}>
            <button onClick={prevPage} disabled={currentPage === 1}>Previous</button>
            
            {pageRange.map((page, index) => (
              <button
                key={`page-${page}-${index}`}
                onClick={() => typeof page === 'number' && goToPage(page)}
                disabled={page === '...' || page === currentPage}
                style={{ 
                  fontWeight: page === currentPage ? 'bold' : 'normal',
                  cursor: typeof page === 'number' ? 'pointer' : 'default'
                }}
              >
                {page}
              </button>
            ))}
            
            <button onClick={nextPage} disabled={currentPage === totalPages}>Next</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HooksDemo;