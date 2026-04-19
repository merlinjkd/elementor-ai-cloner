<?php
/*
Plugin Name: Elementor AI Cloner
*/

add_action('admin_menu', function () {
  add_menu_page('AI Cloner', 'AI Cloner', 'manage_options', 'ai-cloner', function () {
    ?>
    <h2>Elementor AI Cloner</h2>

    <input id="url" placeholder="Enter URL" style="width:400px;">
    <button onclick="openPicker()">Open Picker</button>

    <iframe id="frame" style="width:100%;height:600px;"></iframe>

    <script>
    function openPicker() {
      const url = document.getElementById('url').value;
      document.getElementById('frame').src =
        'http://localhost:4000/proxy?url=' + encodeURIComponent(url);
    }

    window.addEventListener('message', async (e) => {
      if (e.data.type === 'SECTION_PICKED') {

        const res = await fetch('/wp-json/openclaw/v1/import-elementor', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({
            post_id: new URLSearchParams(window.location.search).get('post'),
            section: e.data.payload
          })
        });

        alert("Imported into Elementor!");
      }
    });
    </script>
    <?php
  });
});
