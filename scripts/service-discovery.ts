
import fetch from 'node-fetch';

interface ServiceInfo {
  name: string;
  port: number;
  healthPath: string;
  status?: 'running' | 'stopped' | 'unknown';
  pid?: number;
}

const SERVICES: ServiceInfo[] = [
  { name: 'api-gateway', port: 8080, healthPath: '/healthz' },
  { name: 'auth-svc', port: 3001, healthPath: '/healthz' },
  { name: 'doc-ingest-svc', port: 3002, healthPath: '/healthz' },
  { name: 'search-svc', port: 3003, healthPath: '/healthz' },
  { name: 'embedding-svc', port: 3004, healthPath: '/healthz' },
  { name: 'agent-svc', port: 3005, healthPath: '/healthz' },
  { name: 'csat-svc', port: 3006, healthPath: '/healthz' },
  { name: 'health-monitor-svc', port: 3007, healthPath: '/healthz' }
];

async function checkServiceStatus(service: ServiceInfo): Promise<ServiceInfo> {
  try {
    const response = await fetch(`http://localhost:${service.port}${service.healthPath}`, {
      timeout: 3000
    });
    
    return {
      ...service,
      status: response.ok ? 'running' : 'unknown'
    };
  } catch (error) {
    return {
      ...service,
      status: 'stopped'
    };
  }
}

async function discoverServices(): Promise<void> {
  console.log('🔍 AI-KMS Service Discovery');
  console.log('=' .repeat(50));

  const results = await Promise.allSettled(
    SERVICES.map(service => checkServiceStatus(service))
  );

  const serviceStatuses = results.map((result, index) => 
    result.status === 'fulfilled' ? result.value : { ...SERVICES[index], status: 'unknown' }
  );

  // Display results
  console.log('\n📋 Service Status:');
  serviceStatuses.forEach(service => {
    const statusIcon = service.status === 'running' ? '✅' : 
                      service.status === 'stopped' ? '❌' : '⚠️';
    const url = `http://localhost:${service.port}`;
    console.log(`${statusIcon} ${service.name.padEnd(20)} | ${service.status.padEnd(8)} | ${url}`);
  });

  // Summary
  const running = serviceStatuses.filter(s => s.status === 'running').length;
  const total = serviceStatuses.length;
  
  console.log('\n📊 Summary:');
  console.log(`Running: ${running}/${total} services`);
  
  if (running === total) {
    console.log('🎉 All services are healthy!');
  } else if (running > 0) {
    console.log('⚠️  Some services are down - check the logs');
  } else {
    console.log('❌ No services are running - run `npm run dev` to start');
  }

  // Gateway check
  const gateway = serviceStatuses.find(s => s.name === 'api-gateway');
  if (gateway?.status === 'running') {
    console.log('\n🌐 API Gateway: http://localhost:8080');
    console.log('🏥 System Health: http://localhost:8080/api/health');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  discoverServices().catch(console.error);
}

export { discoverServices, SERVICES };
