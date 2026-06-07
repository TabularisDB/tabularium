export const mjml = `<mjml>
  <mj-body background-color="#f8fafc">
    <mj-section background-color="#ffffff" padding="32px">
      <mj-column>
        <mj-text font-size="22px" font-weight="600">{{pluginName}} needs changes.</mj-text>
        <mj-text>An admin reviewed your plugin and asked for changes before it can be listed:</mj-text>
        <mj-text font-style="italic">{{reason}}</mj-text>
        <mj-button href="{{baseUrl}}/dashboard/plugins/{{pluginSlug}}" background-color="#0f172a" color="#ffffff">Open your dashboard</mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`
