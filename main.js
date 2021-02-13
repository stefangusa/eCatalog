const apiRoute = 'http://127.0.0.1:5000';
const clase = {
    'clasa-9a': ['comun','Razvan', 'Sandra'],
    'clasa-10b': ['comun', 'Ioana', 'Sorin'],
    'clasa-11a': ['comun', 'Andreea', 'George', 'Maria']
}
const materii = ['fizica', 'geografie', 'istorie'];
const form = document.querySelector('form');
const username = $('#username');
const clasa = $('#clasa');
const materie = $('#materie');
const elev = $("#elev");
const listOfFiles = $('.tab-content-list');

const p_username = $('#p-username');
const p_user = $('#p-user');
const p_group = $('#p-group');
const p_path = $('#p-path');
const p_version = $('#p-version');
const p_policy_name = $('#p-policy-name');
const p_entity_name = $('#p-entity-name');
const p_entity_type = $('#p-entity-type');
const p_method = $('#p-method');

function setHandlers() {
    $('#submit').on('click', function(e) {
        e.preventDefault();

        if (!username.val()) {
            form.reportValidity();
            return;
        }

        listOfFiles.html('<div class="no-files-found">No files found</div>');
        $('.loader-modal').css('display', 'flex');
        
        const route = `${apiRoute}/s3/${username.val()}/${clasa.val()}/${materie.val()}/${elev.val()}`;

        if ($('.tab-selected').hasClass('tab-list') || $('.tab-selected').hasClass('tab-delete')) {
            $.ajax({
                url: `${route}/STAR`,
                type: 'GET',
                success: function(data) {
                    const addedFiles = [];

                    data.files.forEach(f => {
                        let filename = f.substring(f.lastIndexOf('/') + 1);
                        if (filename !== '') {
                            const link = `${route}/${filename}`;
            
                            $.ajax({
                                url: link,
                                cache: false,
                                xhrFields: {
                                    responseType: 'blob'
                                },
                                success: function(responseData) {
                                    const url = window.URL || window.webkitURL;

                                    listOfFiles.append($(`
                                        <div class="downloadable">
                                            <button type="button" class="btn btn-delete-file ${$('.tab-selected').hasClass('tab-delete') ? '' : 'hidden'}"><span>Delete</span></button>
                                            <a href="${url.createObjectURL(responseData)}" download="${filename}">${filename}</a>
                                        </div>`)
                                        .on('click', function(e) {
                                            if (e.target.classList.contains('btn-delete-file')) {
                                                deleteFile($(this), route, filename);
                                            }
                                        })
                                    );

                                    $('.tab-content-list').show();
                                    $('.no-files-found').hide();

                                    addedFiles.push(filename);

                                    if (addedFiles.length === data.files.length) {
                                        $('.loader-modal').css('display', 'none');
                                    }

                                    if (addedFiles.length == 1 && $('.downloadable').length == 0) {
                                        $('.no-files-found').show();
                                        $('.tab-content-list').show();
                                    }
                                },
                                error: function(){
                                    console.log('Loading file: ERROR');
                                }
                            });
                        } else {
                            addedFiles.push(filename);

                            if (addedFiles.length === data.files.length) {
                                $('.loader-modal').css('display', 'none');
                            }

                            if (addedFiles.length == 1 && $('.downloadable').length == 0) {
                                $('.no-files-found').show();
                                $('.tab-content-list').show();
                            }
                        }
                    });
                },
                error: function(err) {
                    $('.loader-modal').css('display', 'none');
                    $('.tab-content-list').hide();
                    showInfoMessage(err.responseText, 'error');
                }
            });
        } else {
            if (!$('.file-upload-field').val()) {
                showInfoMessage('Please, choose a file', 'warning');
                $('.loader-modal').css('display', 'none');
                return;
            }

            let filename = $('.file-upload-field').val().split('\\').pop();
            let file_data = $('.file-upload-field').prop('files')[0];
            if (file_data != undefined) {
                var fileInput = document.querySelector('.file-upload-field');

                var xhr = new XMLHttpRequest();
                xhr.open('POST', `${route}/${filename}`);

                xhr.upload.onprogress = function(e) {
                    /* 
                    * values that indicate the progression
                    * e.loaded
                    * e.total
                    */
                   console.log(e.loaded + ' / ' + e.total);
                };

                xhr.onload = function() {
                    console.log(xhr.response);
                    $('.loader-modal').css('display', 'none');
                    $('.file').val('');
                    showInfoMessage(xhr.responseText, 'success');
                };

                xhr.onreadystatechange = function (e) {
                    if (xhr.readyState === 4) {
                        if (xhr.status === 200) {
                            showInfoMessage(xhr.responseText, 'success');
                        } else {
                            showInfoMessage(xhr.responseText, 'error');
                        }
                    }
                };

                var fd = new FormData();
                fd.append('data', fileInput.files[0]);

                xhr.send(fd);
            }
        }
    });

    $('.file-upload-field').on('change', function() {
        let filename = $(this).val().split('\\').pop();
        $('.file-upload-name').text(filename);
    });

    $('#submit-policy-request').on('click', function() {
        let route = '';

        if ($('.p-tab-selected').hasClass('p-tab-group')) {
            userAndGroup('GET');
        } else if ($('.p-tab-selected').hasClass('p-tab-user-info')) {
            route = `${apiRoute}/user_info/${p_username.val()}/${p_user.val()}`;
            userInfoOrPathInfo(route);
        } else if ($('.p-tab-selected').hasClass('p-tab-path-info')) {
            route = `${apiRoute}/path_info/${p_username.val()}/${p_path.val()}`;
            userInfoOrPathInfo(route);
        } else if ($('.p-tab-selected').hasClass('p-tab-policy')) {
            createOrDeletePolicy('GET');
        } else if ($('.p-tab-selected').hasClass('p-tab-get-policy')) {
            getPolicy();
        } else if ($('.p-tab-selected').hasClass('p-tab-policies')) {
            getUserPolicies();
        } else if ($('.p-tab-selected').hasClass('p-tab-attach-policy')) {
            attachPolicy('GET');
        }
    });

    $('#submit-delete').on('click', function() {
        if ($('.p-tab-selected').hasClass('p-tab-group')) {
            userAndGroup('DELETE');
        } else if ($('.p-tab-selected').hasClass('p-tab-policy')) {
            createOrDeletePolicy('DELETE');
        } else if ($('.p-tab-selected').hasClass('p-tab-attach-policy')) {
            attachPolicy('DELETE');
        }
    });

    $('.info-modal-ok').on('click', function() {
        closeInfoModal();
    })

    $('.select-block-selected').on('click', function() {
        $(this).parent().find('.select-block-options').toggleClass('active');
    });

    $('.tab').on('click', function() {
        $('.tab').removeClass('tab-selected');
        $(this).addClass('tab-selected');
        
        if ($(this).hasClass('tab-upload')) {
            console.log('upload');
            activateS3Mode();
            $('.file-upload-wrapper').css('display', 'flex');
            $('.btn-delete-file').addClass('hidden');
            $('#submit span').text('Upload');
            $('.tab-content-list').hide();
        } else if ($(this).hasClass('tab-delete')) {
            console.log('delete');
            activateS3Mode();
            $('.file-upload-wrapper').css('display', 'none');
            $('.btn-delete-file').removeClass('hidden');
            $('#submit span').text('Request');
            if ($('.downloadable').length > 0) {
                $('.tab-content-list').show();
            }
        } else if ($(this).hasClass('tab-list')) {
            console.log('list');
            activateS3Mode();
            $('.file-upload-wrapper').css('display', 'none');
            $('.btn-delete-file').addClass('hidden');
            $('#submit span').text('Request');
            if ($('.downloadable').length > 0) {
                $('.tab-content-list').show();
            }
        } else {
            activatePolicyMode();
        }
    });

    $('.p-tab').on('click', function() {
        $('.p-tab').removeClass('p-tab-selected');
        $(this).addClass('p-tab-selected');

        if ($(this).hasClass('p-tab-group')) {
            hideAllPolicyInputs();
            $('.input-block-p-username, .input-block-p-user, .input-block-p-group').removeClass('hidden');
            showPolicyRequestButton();
            showSubmitDelete();
            clearPolicyBlocksLayout();
            $('.input-blocks-policies').addClass('input-blocks-policies-3');
        } else if ($(this).hasClass('p-tab-user-info')) {
            hideAllPolicyInputs();
            $('.input-block-p-username, .input-block-p-user').removeClass('hidden');
            showPolicyRequestButton();
            hideSubmitDelete();
            clearPolicyBlocksLayout();
            $('.input-blocks-policies').addClass('input-blocks-policies-2');
        } else if ($(this).hasClass('p-tab-path-info')) {
            hideAllPolicyInputs();
            $('.input-block-p-username, .input-block-p-path').removeClass('hidden');
            showPolicyRequestButton();
            hideSubmitDelete();
            clearPolicyBlocksLayout();
            $('.input-blocks-policies').addClass('input-blocks-policies-2');
        } else if ($(this).hasClass('p-tab-policy')) {
            hideAllPolicyInputs();
            $('.input-block-p-username, .input-block-p-policy-name, .input-block-p-method, .input-block-p-path').removeClass('hidden');
            showPolicyRequestButton();
            showSubmitDelete();
            clearPolicyBlocksLayout();
            $('.input-blocks-policies').addClass('input-blocks-policies-4');
        } else if ($(this).hasClass('p-tab-get-policy')) {
            hideAllPolicyInputs();
            $('.input-block-p-username, .input-block-p-policy-name, .input-block-p-version').removeClass('hidden');
            showPolicyRequestButton();
            hideSubmitDelete();
            clearPolicyBlocksLayout();
            $('.input-blocks-policies').addClass('input-blocks-policies-3');
        } else if ($(this).hasClass('p-tab-policies')) {
            hideAllPolicyInputs();
            $('.input-block-p-username').removeClass('hidden');
            showPolicyRequestButton();
            hideSubmitDelete();
            clearPolicyBlocksLayout();
            $('.input-blocks-policies').addClass('input-blocks-policies-1');
        } else if ($(this).hasClass('p-tab-attach-policy')) {
            hideAllPolicyInputs();
            $('.input-block-p-username, .input-block-p-policy-name, .input-block-p-entity-name, .input-block-p-entity-type').removeClass('hidden');
            showPolicyRequestButton();
            showSubmitDelete();
            clearPolicyBlocksLayout();
            $('.input-blocks-policies').addClass('input-blocks-policies-4');
        }
    });
}

function deleteFile($this, route, filename) {
    console.log($this);
    console.log('TO DEL:' + `${route}/${filename}`);
    $('.loader-modal').css('display', 'flex');

    $.ajax({
        url: `${route}/${filename}`,
        type: 'DELETE',
        success: function(response) {
            $('.loader-modal').css('display', 'none');
            $this.remove();
            showInfoMessage(response, 'success');
        },
        error: function(err) {
            showInfoMessage(err, 'error');
        }
    })
}

function userAndGroup(requestType) {
    const route = `${apiRoute}/group/${p_username.val()}/${p_user.val()}/${p_group.val()}`;

    $.ajax({
        url: `${route}`,
        type: requestType,
        success: function(data) {
            $('.loader-modal').css('display', 'none');
            showInfoMessage(data, 'success');
        },
        error: function(err) {
            $('.loader-modal').css('display', 'none');
            $('.tab-content-list').hide();
            showInfoMessage(err.responseText, 'error');
        }
    });
}

function userInfoOrPathInfo(route) {
    $('.loader-modal').css('display', 'flex');
    listOfFiles.html('<div class="no-files-found">No files found</div>');

    $.ajax({
        url: `${route}`,
        type: 'GET',
        success: function(data) {
            console.log(data);
            const parsedData = JSON.parse(data);
            console.log(parsedData);

            $('.loader-modal').css('display', 'none');

            const parsedDataKeys = Object.keys(parsedData);

            parsedDataKeys.forEach(i => {
                const row = $(`<div class="downloadable"><span class="policy-owner">${i}</span></div>`);
                
                parsedData[i].forEach(p => {
                    row.append(
                        $(`<div class="downloadable"><span class="policy">${p}</span></div>`)
                    );
                });

                listOfFiles.append(row);
            });

            $('.tab-content-list').show();
            $('.no-files-found').hide();
        },
        error: function(err) {
            $('.loader-modal').css('display', 'none');
            $('.tab-content-list').hide();
            showInfoMessage(err.responseText, 'error');
        }
    });
}

function createOrDeletePolicy(requestType) {
    const route = `${apiRoute}/policy/${p_username.val()}/${p_policy_name.val()}/${p_method.val()}/${p_path.val()}`;

    $('.loader-modal').css('display', 'flex');

    $.ajax({
        url: `${route}`,
        type: requestType,
        success: function(data) {
            $('.loader-modal').css('display', 'none');
            showInfoMessage(data, 'success');
        },
        error: function(err) {
            $('.loader-modal').css('display', 'none');
            $('.tab-content-list').hide();
            showInfoMessage(err.responseText, 'error');
        }
    });
}

function getPolicy() {
    const route = `${apiRoute}/get_policy/${p_username.val()}/${p_policy_name.val()}/${p_version.val()}`;

    $('.loader-modal').css('display', 'flex');
    listOfFiles.html('<div class="no-files-found">No files found</div>');

    $.ajax({
        url: `${route}`,
        type: 'GET',
        success: function(data) {
            console.log(data);
            const parsedData = JSON.parse(data);
            console.log(parsedData);

            $('.loader-modal').css('display', 'none');

            const parsedDataKeys = Object.keys(parsedData);

            parsedDataKeys.forEach((i, c) => {
                const row = $(`<div class="downloadable"><span class="policy-owner">${i}</span></div>`);

                if (c == 0) {
                    parsedDataKeys2 = Object.keys(parsedData[i]);

                    parsedDataKeys2.forEach(j => {
                        const row2 = $(`<div class="downloadable"><span class="policy-owner">${j}</span></div>`);
                        parsedData[i][j].forEach(p => {
                            row2.append(
                                $(`<div class="downloadable"><span class="policy">${p}</span></div>`)
                            );
                        });
                        row.append(row2);
                    });

                } else {
                    parsedData[i].forEach(p => {
                        row.append(
                            $(`<div class="downloadable"><span class="policy">${p}</span></div>`)
                        );
                    });
                }

                listOfFiles.append(row);
            });

            $('.tab-content-list').show();
            $('.no-files-found').hide();
        },
        error: function(err) {
            $('.loader-modal').css('display', 'none');
            $('.tab-content-list').hide();
            showInfoMessage(err.responseText, 'error');
        }
    });
}

function getUserPolicies() {
    const route = `${apiRoute}/policies/${p_username.val()}`;

    $('.loader-modal').css('display', 'flex');
    listOfFiles.html('<div class="no-files-found">No files found</div>');

    $.ajax({
        url: `${route}`,
        type: 'GET',
        success: function(data) {
            $('.loader-modal').css('display', 'none');
            console.log(JSON.parse(data));
            const parsedData = JSON.parse(data);
            parsedData.forEach((i, c) => {
                const row = $(`<div class="downloadable"><span class="policy-owner">${c}</span></div>`);
                const iKeys = Object.keys(i);
                console.log(iKeys);
                iKeys.forEach(k => {
                    const row2 = $(`<div class="downloadable"><span class="policy-owner"><strong>${k}:</strong> ${i[k]}</span></div>`);
                    row.append(row2);
                });
                listOfFiles.append(row);
            });

            $('.tab-content-list').show();
            $('.no-files-found').hide();
        },
        error: function(err) {
            $('.loader-modal').css('display', 'none');
            $('.tab-content-list').hide();
            showInfoMessage(err.responseText, 'error');
        }
    });
}

function attachPolicy(requestType) {
    const route = `${apiRoute}/policy_attachment/${p_username.val()}/${p_policy_name.val()}/${p_entity_name.val()}/${p_entity_type.val()}`;

    $('.loader-modal').css('display', 'flex');

    $.ajax({
        url: `${route}`,
        type: requestType,
        success: function(data) {
            $('.loader-modal').css('display', 'none');
            showInfoMessage(data, 'success');
        },
        error: function(err) {
            $('.loader-modal').css('display', 'none');
            $('.tab-content-list').hide();
            showInfoMessage(err.responseText, 'error');
        }
    });
}

function showSubmitDelete() {
    $('.submit-delete').removeClass('hidden');
    $('#submit-policy-request span').html('Set Policy');
}

function hideSubmitDelete() {
    $('.submit-delete').addClass('hidden');
    $('#submit-policy-request span').html('Request Policy');
}

function showRequestButton() {
    $('.request-btn-container').removeClass('hidden');
}

function hideRequestButton() {
    $('.request-btn-container').addClass('hidden');
}

function showPolicyRequestButton() {
    $('.submit-policy-request-container').removeClass('hidden');
}

function hidePolicyRequestButton() {
    $('.submit-policy-request-container').addClass('hidden');
}

function activateS3Mode() {
    $('.p-tabs').addClass('hidden');
    $('.input-blocks-policies').addClass('hidden');
    $('.input-blocks-s3').removeClass('hidden');
    $('.p-tab').removeClass('p-tab-selected');
    hidePolicyRequestButton();
    hideSubmitDelete();
    hideAllPolicyInputs();
    showRequestButton();
}

activateS3Mode();

function activatePolicyMode() {
    $('.p-tabs').removeClass('hidden');
    $('.input-blocks-s3').addClass('hidden');
    $('.input-blocks-policies').removeClass('hidden');
    hideRequestButton();
    $('.file-upload-wrapper').css('display', 'none');
}

function clearPolicyBlocksLayout() {
    for (let i = 0; i < 5; i++) {
        $('.input-blocks-policies').removeClass(`input-blocks-policies-${i}`);
    }
}

function hideAllPolicyInputs() {
    $('.input-block-p-username, .input-block-p-user, .input-block-p-group, .input-block-p-path, .input-block-p-user, .input-block-p-version, .input-block-p-policy-name, .input-block-p-entity-name, .input-block-p-entity-type, .input-block-p-method').addClass('hidden');
}

hideAllPolicyInputs();

function closeInfoModal() {
    $('.info-modal').css('display', 'none')
    $('.info-status').removeClass('info-status-success info-status-warning info-status-error');
}

function showInfoMessage(message, type) {
    $('.info-status').addClass(`info-status-${type}`);
    $('.info-message').text(message);
    $('.info-modal').css('display', 'flex');
}

function populateSelectBoxes() {
    const classNames = Object.keys(clase);

    $('.select-clasa .select-block-selected').text(classNames[0]);
    $('#clasa').val(classNames[0]);

    classNames.forEach(c => {
        $('.select-clasa .select-block-options').append(
            $('<div class="select-block-option"></div>')
            .text(c)
            .on('click', function () {
                $('.select-clasa .select-block-selected').text($(this).text());
                $('#clasa').val($(this).text());
                $(this).parent().removeClass('active');
                populateStudents();
            })
        );
    });

    populateStudents();
    populateSubjects();
}

function populateStudents() {
    const clasaSelected = $('.select-clasa .select-block-selected').text();
    $('.select-elev .select-block-options').html('');
    clase[clasaSelected].forEach(elev => {
        $('.select-elev .select-block-options').append(
            $('<div class="select-block-option"></div>')
            .text(elev)
            .on('click', function () {
                $('.select-elev .select-block-selected').text($(this).text());
                $('#elev').val($(this).text());
                $(this).parent().removeClass('active');
            })
        );
    });

    $('.select-elev .select-block-selected').text(clase[clasaSelected][0]);
    $('#elev').val(clase[clasaSelected][0]);
}

function populateSubjects() {
    $('.select-materie .select-block-selected').text(materii[0]);
    $('#materie').val(materii[0]);

    materii.forEach(m => {
        $('.select-materie .select-block-options').append(
            $('<div class="select-block-option"></div>')
            .text(m)
            .on('click', function () {
                $('.select-materie .select-block-selected').text($(this).text());
                $('#materie').val($(this).text());
                $(this).parent().removeClass('active');
            })
        );
    });
}

populateSelectBoxes();
setHandlers();