'use strict';

require('dotenv').config();

const {
  createMcpExpressApp,
} = require('@modelcontextprotocol/sdk/server/express.js');

const {
  StreamableHTTPServerTransport,
} = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { buildMcpServer } = require('./server');

const app = createMcpExpressApp({ host: process.env.MCP_HOST });

function requireAuthKey(req, res, next) {
  if (req.headers.authorization != `Bearer ${process.env.INT1_MCP_AUTH_KEY}`) {
    return res.status(401).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32001, message: 'Unauthorized' },
    });
  }

  next();
}

app.use('/mcp', requireAuthKey);

app.post('/mcp', async (req, res) => {
  const server = buildMcpServer(process.env.INT1_API_URL);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on('close', () => {
    transport.close();
    server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error(err);
  }
});

app.listen(process.env.MCP_PORT, process.env.MCP_HOST, (err) => {
  if (err) {
    console.error('MCP server failed to start: ', err);
    process.exit(1);
  }

  console.log(
    'MCP server is running on ',
    process.env.MCP_HOST,
    process.env.MCP_PORT
  );
});
