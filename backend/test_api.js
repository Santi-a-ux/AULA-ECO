const jwt = require('jsonwebtoken');

// Función para hacer login y obtener token
async function login(username, password) {
  try {
    const response = await fetch('http://localhost:3000/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      throw new Error(`Login failed: ${response.status}`);
    }

    const data = await response.json();
    console.log('Login successful:', data);
    return data.token;
  } catch (error) {
    console.error('Login error:', error.message);
    return null;
  }
}

// Función para probar una API con token
async function testAPI(endpoint, token) {
  try {
    const response = await fetch(`http://localhost:3000/api/${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`API ${endpoint} successful:`, data);
    return data;
  } catch (error) {
    console.error(`API ${endpoint} error:`, error.message);
    return null;
  }
}

// Función principal para probar
async function testBackend() {
  console.log('Testing backend APIs...');

  // Primero verificar si el servidor está corriendo
  try {
    const response = await fetch('http://localhost:3000/api/login', {
      method: 'OPTIONS',
    });
    console.log('Server is responding to OPTIONS request');
  } catch (error) {
    console.error('Server is not running or not accessible:', error.message);
    return;
  }

  // Hacer login
  const token = await login('user', 'user123');
  if (!token) return;

  // Probar diferentes endpoints
  await testAPI('me/records', token);
  await testAPI('stats', token);
  await testAPI('evolution', token);

  // Probar login de admin
  const adminToken = await login('admin', 'admin123');
  if (adminToken) {
    await testAPI('global-stats', adminToken);
    await testAPI('admin/recyclings', adminToken);
  }
}

testBackend();