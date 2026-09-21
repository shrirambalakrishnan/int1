'use strict';

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

function buildMcpServer(int1Url) {
  const server = new McpServer({ name: 'int1', version: '0.0.1' });

  server.registerTool(
    'list_integrations',
    {
      title: 'List Integrations',
      description: 'List integrations configured in int1',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const res = await fetch(`${int1Url}/integrations`);
        const text = await res.text();

        return { isError: !res.ok, content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  server.registerTool(
    'list_boards',
    {
      title: 'List Boards',
      description:
        'List all boards in int1. Each board has id and an integrationId showing the integration provider it syncs to',
      annotations: { readOnlyHint: true },
    },
    async () => {
      try {
        const res = await fetch(`${int1Url}/boards`);
        const text = await res.text();

        return { isError: !res.ok, content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  server.registerTool(
    'list_tasks',
    {
      title: 'List tasks',
      description: 'List Tasks in one board. Get boardId from list_boards',
      inputSchema: { boardId: z.number().int().describe('int1 board id') },
      annotations: { readOnlyHint: true },
    },
    async ({ boardId }) => {
      try {
        const res = await fetch(`${int1Url}/boards/${boardId}/tasks`);
        const text = await res.text();

        return { isError: !res.ok, content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  server.registerTool(
    'create_board',
    {
      title: 'Create a board in int1',
      description:
        'Create board in int1. It is synced to the provider of given integration. Get integrationId from list_integrations.',
      inputSchema: {
        name: z.string().min(1).describe('board name'),
        integrationId: z.number().int().describe('int1 integration id'),
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ name, integrationId }) => {
      try {
        const res = await fetch(`${int1Url}/boards`, {
          method: 'POST',
          headers: { 'Content-type': 'application/json' },
          body: JSON.stringify({ name, integrationId }),
        });
        const text = await res.text();

        return { isError: !res.ok, content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  server.registerTool(
    'create_task',
    {
      title: 'Create task',
      description:
        'Create a task in a board. It is synced to board provider. Get boardId from list_boards',
      inputSchema: {
        boardId: z.number().int().describe('int1 board id'),
        title: z.string().min(1).describe('task title'),
        description: z.string().optional().describe('task description'),
      },
      annotations: { destructiveHint: false, openWorldHint: true },
    },
    async ({ boardId, title, description }) => {
      try {
        const res = await fetch(`${int1Url}/boards/${boardId}/tasks`, {
          method: 'POST',
          headers: { 'Content-type': 'application/json' },
          body: JSON.stringify({ title, description }),
        });
        const text = await res.text();

        return { isError: !res.ok, content: [{ type: 'text', text }] };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: err.message }],
        };
      }
    }
  );

  return server;
}

module.exports = { buildMcpServer };
